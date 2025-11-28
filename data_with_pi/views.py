# data_with_pi/views.py
import os
import logging

from django.utils import timezone as dj_timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib import messages
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from .models import CaptureResult, Plant, UserCameraPreset
from .forms import UserProfileForm
from .services.pi_client import PiClient

# Khởi tạo Pi client
pi_client = PiClient()
logger = logging.getLogger(__name__)

def home(request):
    """Trang chủ - hiển thị khác nhau cho user đã đăng nhập/chưa đăng nhập"""
    # Lấy 34 cây thuốc từ database
    plants = Plant.objects.all().order_by('name')[:34]
    return render(request, 'home.html', {'plants': plants})


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
            login(request, user)
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
    status = pi_client.get_status()
    stream_url = pi_client.get_stream_url()
    return render(request, 'search.html', {
        'stream_url': stream_url,
        'pi_status': status,
        'pi_base': pi_client.base_url,
    })


@login_required
def record(request):
    """Trang quay video - yêu cầu đăng nhập"""
    status = pi_client.get_status()
    stream_url = pi_client.get_stream_url()
    return render(request, 'record.html', {
        'stream_url': stream_url,
        'pi_status': status,
        'pi_base': pi_client.base_url,
    })


@login_required
@require_http_methods(["POST"])
def api_save_capture_result(request):
    """API endpoint: Lưu kết quả phân tích vào database khi người dùng click 'Lưu'"""
    import json
    
    try:
        data = json.loads(request.body)
        label = (data.get('name') or '').strip()
        confidence = data.get('confidence', 0)
        file = data.get('file', '')
        image_url = data.get('image_url', '')
        image_size_bytes = data.get('image_size_bytes', 0)
        
        if not label:
            return JsonResponse({"success": False, "error": "Không có tên thực vật"}, status=400)
        
        # Kiểm tra các trường hợp không được lưu
        label_lower = label.lower()
        if label_lower == 'background' or label_lower == 'green_but_not_leaf':
            return JsonResponse({
                "success": False,
                "error": f"'{label}' không được lưu vào database"
            }, status=400)
        

        # Tìm hoặc tạo Plant theo tên khoa học
        plant, created = Plant.objects.get_or_create(
            scientific_name=label, 
            defaults={'name': label, 'should_save': True}
        )
    
        # Kiểm tra should_save
        if not plant.should_save:
                return JsonResponse({
                    "success": False,
                    "error": f"'{label}' không được lưu vào database (should_save=False)"
                }, status=400)
        
        # Log thông tin về kích thước ảnh nếu có
        if image_size_bytes:
                logger.info(f"[Save Capture] Image size: {image_size_bytes} bytes ({image_size_bytes / 1024:.1f} KB)")
        
        # Lưu bản ghi
        capture_record = CaptureResult.objects.create(
            user=request.user,
            plant=plant,
            name=label,
            confidence=confidence,
            image_file=file,
            local_image=None,
            success=True,
            source='pi',
            raw={
                'name': label,
                'confidence': confidence,
                'file': file,
                'image_url': image_url,
                'image_size_bytes': image_size_bytes
            }
        )
        
        # Refresh plant từ database để lấy đầy đủ thông tin
        plant.refresh_from_db()
            
        # Trả về JSON với đầy đủ thông tin plant
        return JsonResponse({
            'success': True,
            'message': f"Đã lưu: {label} ({confidence:.1%})",
            'result': {
                'name': plant.name,
                'scientific_name': plant.scientific_name or '',
                'english_name': plant.english_name or '',
                'vietnamese_name': plant.vietnamese_name or plant.name,
                'description': plant.description or '',
                'usage': plant.usage or '',
                'common_locations': plant.common_locations or '',
                'biological_info': plant.biological_info or '',
                'medicinal_info': plant.medicinal_info or '',
                'confidence': confidence,
                'image_file': file,
                'image_url': image_url or f"{pi_client.base_url}/history/image/{file}",
                'image_size_bytes': image_size_bytes,
                'created_at': capture_record.created_at.isoformat(),
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    except Exception as e:
        logger.error(f"[Save Capture] Error: {e}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)

@login_required
@require_http_methods(["POST"])
def upload_analyze(request):
    """Upload ảnh và phân tích"""
    f = request.FILES.get('image')
    if not f:
        messages.error(request, 'Vui lòng chọn file ảnh.')
        return redirect('search')
    
    allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if f.content_type not in allowed or f.size > 10 * 1024 * 1024:
        messages.error(request, 'Ảnh không hợp lệ hoặc vượt quá 10MB.')
        return redirect('search')
    
    # Đọc file vào memory
    data_bytes = f.read()
    
    # Gọi Pi API
    resp = pi_client.upload_image(data_bytes, f.name, f.content_type)
    
    if not resp.get('success'):
        error_msg = resp.get('error', 'Lỗi không xác định')
        messages.error(request, f'Phân tích thất bại: {error_msg}')
        return redirect('search')
    
    label = (resp.get('name') or '').strip()
    plant, _ = Plant.objects.get_or_create(
        scientific_name=label, 
        defaults={'name': label, 'should_save': True}
    )
    
    if plant.should_save:
        ext = os.path.splitext(f.name)[1].lower() or '.jpg'
        local_name = f'uploads/{dj_timezone.now():%Y/%m/%d}/user_{request.user.id}_{dj_timezone.now():%Y%m%d_%H%M%S}{ext}'
        local_path = default_storage.save(local_name, ContentFile(data_bytes))
        
        CaptureResult.objects.create(
            user=request.user,
            plant=plant,
            name=label,
            confidence=resp.get('confidence'),
            image_file=resp.get('file', ''),
            local_image=local_path,
            success=True,
            source='upload',
            raw=resp,
        )
        confidence = resp.get('confidence', 0)
        messages.success(request, f"Đã lưu: {label} ({confidence:.1%})")
    else:
        messages.info(request, f"'{label}' chương trình sẽ không lưu kết quả này!")
    
    return redirect('search')


@login_required
def history(request):
    """Lịch sử tra cứu - chỉ hiển thị của user hiện tại"""
    # Lấy lịch sử từ Pi (optional)
    pi_history = pi_client.get_history(limit=50)
    pi_files = pi_history.get('files', []) if pi_history.get('success') else []
    
    # Lấy kết quả từ database
    results = CaptureResult.objects.filter(user=request.user).select_related('plant').order_by('-created_at')[:50]
    
    return render(request, 'history.html', {
        'pi_base': pi_client.base_url,
        'pi_files': pi_files,
        'results': results,
    })


@login_required
def plant_detail(request, plant_id):
    """Trang chi tiết thông tin cây/thực vật"""
    plant = get_object_or_404(Plant.objects.prefetch_related('captures', 'recipes'), id=plant_id)
    recent_captures = plant.captures.filter(user=request.user).order_by('-created_at')[:10]
    recipes = plant.recipes.filter(is_verified=True).order_by('-popularity', 'name')
    return render(request, 'plant_detail.html', {
        'plant': plant,
        'recent_captures': recent_captures,
        'recipes': recipes,
        'pi_base': pi_client.base_url,
    })


@login_required
def test(request):
    """Trang test - copy của search page để test các tính năng mới"""
    return render(request, 'test.html', {
        'pi_base': pi_client.base_url,
        'stream_url': pi_client.get_stream_url(),
    })


@login_required
def recipe_detail(request, recipe_id):
    """Trang chi tiết công thức thuốc"""
    from .models import Recipe
    recipe = get_object_or_404(
        Recipe.objects.select_related('plant', 'created_by').prefetch_related('images'),
        id=recipe_id
    )
    
    # Tăng độ phổ biến khi xem
    recipe.popularity += 1
    recipe.save(update_fields=['popularity'])
    
    return render(request, 'recipe_detail.html', {
        'recipe': recipe,
    })


# API endpoints cho AJAX calls
@login_required
@require_http_methods(["POST"])
def api_capture_preview(request):
    """API endpoint: Capture ảnh và trả về ngay để hiển thị (preview) - KHÔNG phân tích"""
    try:
        result = pi_client.capture_preview()
        return JsonResponse(result)
    except Exception as e:
        logger.error(f"[API] Error in capture preview: {e}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def api_analyze_image(request):
    """API endpoint: Phân tích ảnh đã capture từ preview"""
    import json
    try:
        data = json.loads(request.body)
        filename = data.get('filename')
        
        if not filename:
            return JsonResponse({"success": False, "error": "filename is required"}, status=400)
        
        result = pi_client.analyze_image(filename)
        return JsonResponse(result)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    except Exception as e:
        logger.error(f"[API] Error in analyze image: {e}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
def api_status(request):
    """API endpoint: Lấy trạng thái Pi"""
    status = pi_client.get_status()
    return JsonResponse(status)


@login_required
@require_http_methods(["POST"])
def api_pause_stream(request):
    """API endpoint: Tạm dừng stream"""
    result = pi_client.pause_stream()
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def api_resume_stream(request):
    """API endpoint: Tiếp tục stream"""
    result = pi_client.resume_stream()
    return JsonResponse(result)


@login_required
def api_get_settings(request):
    """API endpoint: Lấy cấu hình camera"""
    settings = pi_client.get_settings()
    return JsonResponse(settings)


@login_required
@require_http_methods(["POST"])
def api_set_mode(request):
    """API endpoint: Thiết lập chế độ camera"""
    mode = request.POST.get('mode', 'still')
    result = pi_client.set_mode(mode)
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def api_restart_camera(request):
    """API endpoint: Khởi động lại camera"""
    result = pi_client.restart_camera()
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def api_reload_model(request):
    """API endpoint: Tải lại model"""
    result = pi_client.reload_model()
    return JsonResponse(result)


@login_required
def api_get_camera_settings(request):
    """API endpoint: Lấy thông số camera hiện tại"""
    settings = pi_client.get_camera_settings()
    return JsonResponse(settings)


@login_required
@require_http_methods(["POST"])
def api_set_camera_settings(request):
    """API endpoint: Thiết lập thông số camera"""
    import json
    try:
        data = json.loads(request.body)
        result = pi_client.set_camera_settings(data)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def api_apply_preset(request):
    """API endpoint: Áp dụng preset"""
    import json
    try:
        data = json.loads(request.body)
        preset_name = data.get("preset", "daylight")
        result = pi_client.apply_preset(preset_name)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
def api_get_presets(request):
    """API endpoint: Lấy danh sách preset hệ thống"""
    result = pi_client.get_available_presets()
    return JsonResponse(result)


@login_required
def api_get_resolution_info(request):
    """API endpoint: Lấy thông tin resolution hiện tại"""
    result = pi_client.get_resolution_info()
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def api_change_resolution(request):
    """API endpoint: Thay đổi resolution"""
    import json
    try:
        data = json.loads(request.body)
        profile_name = data.get("profile")
        result = pi_client.change_resolution(profile_name)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
def api_get_resolution_profiles(request):
    """API endpoint: Lấy danh sách resolution profiles"""
    result = pi_client.get_resolution_profiles()
    return JsonResponse(result)


# UI Settings endpoints (user-friendly)
@login_required
def api_get_ui_settings_definitions(request):
    """API endpoint: Lấy definitions của UI settings"""
    result = pi_client.get_ui_settings_definitions()
    return JsonResponse(result)


@login_required
def api_get_current_ui_settings(request):
    """API endpoint: Lấy UI settings hiện tại"""
    result = pi_client.get_current_ui_settings()
    return JsonResponse(result)


@login_required
@require_http_methods(["POST"])
def api_apply_ui_settings(request):
    """API endpoint: Áp dụng UI settings"""
    import json
    try:
        data = json.loads(request.body)
        ui_settings = data.get("ui_settings", {})
        if not ui_settings:
            return JsonResponse({"error": "Missing ui_settings"}, status=400)
        result = pi_client.apply_ui_settings(ui_settings)
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
def api_get_user_presets(request):
    """API endpoint: Lấy danh sách preset của user"""
    presets = UserCameraPreset.objects.filter(user=request.user).values('id', 'name', 'settings', 'is_default', 'created_at')
    return JsonResponse({
        'presets': list(presets),
        'system_presets': ['daylight', 'night', 'sport', 'security']
    })


@login_required
@require_http_methods(["POST"])
def api_save_preset(request):
    """API endpoint: Lưu preset của user"""
    import json
    try:
        data = json.loads(request.body)
        preset_name = data.get('name', '').strip()
        settings = data.get('settings', {})
        is_default = data.get('is_default', False)
        
        if not preset_name:
            return JsonResponse({"error": "Tên preset không được để trống"}, status=400)
        
        # Nếu set default, bỏ default của các preset khác
        if is_default:
            UserCameraPreset.objects.filter(user=request.user, is_default=True).update(is_default=False)
        
        # Tạo hoặc cập nhật preset
        preset, created = UserCameraPreset.objects.update_or_create(
            user=request.user,
            name=preset_name,
            defaults={
                'settings': settings,
                'is_default': is_default
            }
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Đã lưu preset thành công',
            'preset': {
                'id': preset.id,
                'name': preset.name,
                'is_default': preset.is_default
            }
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def api_load_user_preset(request):
    """API endpoint: Load và áp dụng preset của user"""
    import json
    try:
        data = json.loads(request.body)
        preset_id = data.get('preset_id')
        
        if not preset_id:
            return JsonResponse({"error": "preset_id không được để trống"}, status=400)
        
        preset = get_object_or_404(UserCameraPreset, id=preset_id, user=request.user)
        
        # Áp dụng settings lên Pi
        result = pi_client.set_camera_settings(preset.settings)
        
        if result.get('error'):
            return JsonResponse({"error": result['error']}, status=400)
        
        return JsonResponse({
            'success': True,
            'message': f'Đã áp dụng preset: {preset.name}',
            'settings': preset.settings
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def api_delete_preset(request):
    """API endpoint: Xóa preset của user"""
    import json
    try:
        data = json.loads(request.body)
        preset_id = data.get('preset_id')
        
        if not preset_id:
            return JsonResponse({"error": "preset_id không được để trống"}, status=400)
        
        preset = get_object_or_404(UserCameraPreset, id=preset_id, user=request.user)
        preset_name = preset.name
        preset.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Đã xóa preset: {preset_name}'
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


# Video recording endpoints (tạm thời - chỉ để quay video lưu trên Pi, không lưu DB)
@login_required
@require_http_methods(["POST"])
def api_start_video_recording(request):
    """API endpoint: Bắt đầu quay video - chỉ gọi Pi API, không lưu DB"""
    import json
    try:
        data = json.loads(request.body) if request.body else {}
        duration = data.get('duration')  # Optional: thời gian quay (giây)
        
        result = pi_client.start_video_recording(duration=duration)
        return JsonResponse(result)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)
    except Exception as e:
        logger.error(f"[Video] Error starting recording: {e}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def api_stop_video_recording(request):
    """API endpoint: Dừng quay video và lưu trên Pi - KHÔNG lưu vào DB"""
    try:
        result = pi_client.stop_video_recording()
        # Video được lưu trực tiếp trên Pi, không cần lưu vào Django DB
        return JsonResponse(result)
    except Exception as e:
        logger.error(f"[Video] Error stopping recording: {e}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
def api_get_video_recording_status(request):
    """API endpoint: Lấy trạng thái recording"""
    status = pi_client.get_video_recording_status()
    return JsonResponse(status)