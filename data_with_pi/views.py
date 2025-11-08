# data_with_pi/views.py
import os, io, time, mimetypes, requests
from urllib.parse import quote
from django.utils import timezone as dj_timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_http_methods
from .models import CaptureResult, Plant
from .forms import UserProfileForm

def home(request):
    """Trang chủ - hiển thị khác nhau cho user đã đăng nhập/chưa đăng nhập"""
    return render(request, 'home.html')

def register(request):
    """Đăng ký tài khoản mới"""
    if request.user.is_authenticated:
        return redirect('home')
    
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            username = form.cleaned_data.get('username')
            messages.success(request, f'Tài khoản {username} đã được tạo thành công!')
            login(request, user)  # Tự động đăng nhập sau khi đăng ký
            return redirect('home')
    else:
        form = UserCreationForm()
    return render(request, 'register.html', {'form': form})

def login_view(request):
    """Đăng nhập"""
    if request.user.is_authenticated:
        return redirect('home')
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, f'Chào mừng, {username}!')
            next_url = request.GET.get('next', 'home')
            return redirect(next_url)
        else:
            messages.error(request, 'Tên đăng nhập hoặc mật khẩu không đúng.')
    return render(request, 'login.html')

@login_required
def logout_view(request):
    """Đăng xuất"""
    from django.contrib.auth import logout
    logout(request)
    messages.info(request, 'Bạn đã đăng xuất.')
    return redirect('home')

@login_required
def profile(request):
    """Xem thông tin tài khoản"""
    return render(request, 'profile.html')

@login_required
def edit_profile(request):
    """Chỉnh sửa thông tin tài khoản"""
    if request.method == 'POST':
        form = UserProfileForm(request.POST, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, 'Thông tin đã được cập nhật.')
            return redirect('profile')
    else:
        form = UserProfileForm(instance=request.user)
    return render(request, 'edit_profile.html', {'form': form})

@login_required
def search(request):
    """Trang tra cứu - yêu cầu đăng nhập"""
    pi_base = settings.PI_API_BASE_URL.rstrip('/')
    stream_url = f'{pi_base}/stream'
    return render(request, 'search.html', {'stream_url': stream_url, 'pi_base': pi_base})

@login_required
@require_http_methods(["POST"])
def capture(request):
    pi_base = settings.PI_API_BASE_URL.rstrip('/')

    # 1) Gọi Pi chụp, YÊU CẦU trả kèm ảnh
    try:
        r = requests.post(f'{pi_base}/capture?return_image=1', timeout=30)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        messages.error(request, f'Lỗi gọi Pi: {e}')
        return redirect('search')
    except ValueError:
        messages.error(request, 'Phản hồi không phải JSON.')
        return redirect('search')

    if not data.get('success'):
        messages.error(request, f"Capture thất bại: {data}")
        return redirect('search')

    # 2) Plant/label
    label = (data.get('name') or '').strip()
    plant, _ = Plant.objects.get_or_create(name=label, defaults={'should_save': True})
    if not plant.should_save:
        messages.info(request, f"'{label}' chương trình sẽ không lưu kết quả này!")
        return redirect('search')

    # 3) Lưu ảnh local: ƯU TIÊN base64; FALLBACK tải từ Pi
    local_path = None
    fname = (data.get('image_file') or '').strip()

    # 3a) Nếu API trả ảnh base64 → ghi trực tiếp vào MEDIA
    img_b64 = data.get('image_b64')
    if img_b64:
        try:
            img_bytes = base64.b64decode(img_b64)
            mime = (data.get('image_mime') or 'image/jpeg').lower()
            ext = mimetypes.guess_extension(mime) or '.jpg'
            if not ext.startswith('.'):
                ext = f'.{ext}'
            local_name = f'captures/{dj_timezone.now():%Y/%m/%d}/pi_{request.user.id}_{dj_timezone.now():%Y%m%d_%H%M%S}{ext}'
            local_path = default_storage.save(local_name, ContentFile(img_bytes))
        except Exception as e:
            messages.warning(request, f'')

    # 3b) Fallback: tải ảnh từ /history/image nếu chưa có local_path
    if not local_path and fname:
        def try_download(url, timeout=20):
            resp = requests.get(url, timeout=timeout)
            if not resp.ok:
                return None
            ctype = resp.headers.get('Content-Type', '')
            ext = mimetypes.guess_extension(ctype) or ('.' + fname.split('.')[-1] if '.' in fname else '.jpg')
            if not ext.startswith('.'):
                ext = f'.{ext}'
            ext = ext.lower()
            local_name = f'captures/{dj_timezone.now():%Y/%m/%d}/pi_{request.user.id}_{dj_timezone.now():%Y%m%d_%H%M%S}{ext}'
            return default_storage.save(local_name, ContentFile(resp.content))

        stem, _ = os.path.splitext(fname)
        candidates = [fname] + [f'{stem}{e}' for e in ('.jpg','.jpeg','.png','.webp','.JPG','.JPEG','.PNG','.WEBP')]
        attempts = [0.2, 0.5, 1.0, 1.8]

        for delay in attempts:
            time.sleep(delay)
            for cand in candidates:
                try:
                    url = f'{pi_base}/history/image/{quote(cand)}'
                    local_path = try_download(url)
                    if local_path:
                        fname = cand
                        break
                except requests.RequestException:
                    continue
            if local_path:
                break

        # Fallback cuối: hỏi /history để tìm file cùng prefix
        if not local_path:
            try:
                h = requests.get(f'{pi_base}/history', timeout=20)
                if h.ok and h.headers.get('Content-Type','').startswith('application/json'):
                    files = h.json().get('files', [])
                    prefix = stem
                    pick = next((f for f in files if f.startswith(prefix)), None)
                    if pick:
                        url = f'{pi_base}/history/image/{quote(pick)}'
                        local_path = try_download(url)
                        if local_path:
                            fname = pick
            except requests.RequestException:
                pass

        if not local_path:
            messages.warning(request, 'Không tải được ảnh từ Pi. Vẫn lưu kết quả, nhưng không có ảnh local.')

    # 4) Lưu bản ghi
    CaptureResult.objects.create(
        user=request.user,
        plant=plant,
        name=label,
        confidence=data.get('confidence'),
        image_file=fname,
        local_image=local_path,
        success=True,
        source='pi',
        raw=data
    )
    messages.success(request, f"Đã lưu: {label} ({data.get('confidence',0):.3f})")
    return redirect('search')

@login_required
@require_http_methods(["POST"])
def upload_analyze(request):
    pi_base = settings.PI_API_BASE_URL.rstrip('/')

    f = request.FILES.get('image')
    if not f:
        messages.error(request, 'Vui lòng chọn file ảnh.')
        return redirect('search')

    allowed = ['image/jpeg','image/jpg','image/png','image/webp']
    if f.content_type not in allowed or f.size > 10*1024*1024:
        messages.error(request, 'Ảnh không hợp lệ hoặc vượt quá 10MB.')
        return redirect('search')

    # KHÔNG lưu MEDIA trước: đọc vào memory
    data_bytes = f.read()

    try:
        files = {'image': (f.name, io.BytesIO(data_bytes), f.content_type)}
        r = requests.post(f'{pi_base}/upload', files=files, timeout=60)
        r.raise_for_status()
        resp = r.json()
    except requests.RequestException as e:
        messages.error(request, f'Lỗi gọi Pi: {e}')
        return redirect('search')
    except ValueError:
        messages.error(request, 'Phản hồi không phải JSON.')
        return redirect('search')

    if not resp.get('success'):
        messages.error(request, f"Phân tích thất bại: {resp.get('error','Unknown')}")
        return redirect('search')

    label = (resp.get('name') or '').strip()
    plant, _ = Plant.objects.get_or_create(name=label, defaults={'should_save': True})

    if plant.should_save:
        ext = os.path.splitext(f.name)[1].lower() or '.jpg'
        local_name = f'uploads/{dj_timezone.now():%Y/%m/%d}/user_{request.user.id}_{dj_timezone.now():%Y%m%d_%H%M%S}{ext}'
        local_path = default_storage.save(local_name, ContentFile(data_bytes))

        CaptureResult.objects.create(
            user=request.user,
            plant=plant,
            name=label,
            confidence=resp.get('confidence'),
            image_file=resp.get('image_file',''),
            local_image=local_path,
            success=True,
            source='upload',
            raw=resp,
        )
        messages.success(request, f"Đã lưu: {label} ({resp.get('confidence',0):.3f})")
    else:
        messages.info(request, f"'{label}' chương trình sẽ không lưu kết quả này!")

    return redirect('search')

@login_required
def history(request):
    """Lịch sử tra cứu - chỉ hiển thị của user hiện tại"""
    pi_base = settings.PI_API_BASE_URL.rstrip('/')
    files, error = [], None
    try:
        r = requests.get(f'{pi_base}/history', timeout=30)
        r.raise_for_status()
        j = r.json()
        if j.get('success'):
            files = j.get('files', [])
        else:
            error = j
    except requests.RequestException as e:
        error = str(e)
    except ValueError:
        error = 'Phản hồi không phải JSON.'
    
    # CHỈ LẤY KẾT QUẢ CỦA USER HIỆN TẠI
    results = CaptureResult.objects.filter(user=request.user).select_related('plant').all()[:50]
    
    return render(request, 'history.html', {
        'pi_base': pi_base,
        'files': files,
        'error': error,
        'results': results,
    })

@login_required
def plant_detail(request, plant_id):
    """Trang chi tiết thông tin cây/thực vật (chỉ dữ liệu của user hiện tại)"""
    plant = get_object_or_404(Plant.objects.prefetch_related('captures'), id=plant_id)
    recent_captures = plant.captures.filter(user=request.user)[:10]
    return render(request, 'plant_detail.html', {
        'plant': plant,
        'recent_captures': recent_captures,
        'pi_base': settings.PI_API_BASE_URL.rstrip('/'),
    })