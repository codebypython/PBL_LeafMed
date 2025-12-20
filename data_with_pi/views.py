# data_with_pi/views.py
import os
import logging

from django.db.models import Q
from django.utils import timezone as dj_timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib import messages
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
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
    plants = Plant.objects.exclude(name__in=['Background', 'Green_but_not_leaf']).order_by('name')[:34]
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
        if label_lower == 'background' or label_lower == 'Green_but_not_leaf':
            return JsonResponse({
                "success": False,
                "error": f"'{label}' không được lưu vào database"
            }, status=400)
        

        # Tìm Plant theo tên khoa học hoặc tên thường
        plant = Plant.objects.filter(
            Q(scientific_name__iexact=label) | Q(name__iexact=label)
        ).first()
        
        # Nếu không tìm thấy, tạo mới với scientific_name
        if not plant:
            plant = Plant.objects.create(
                scientific_name=label,
                name=label,
                should_save=True
            )
            created = True
        else:
            created = False
    
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
            
        # Trả về JSON với đầy đủ thông tin plant và plant_id để redirect
        return JsonResponse({
            'success': True,
            'message': f"Đã lưu: {label} ({confidence:.1%})",
            'plant_id': plant.id,  # Thêm plant_id để redirect đến trang chi tiết
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
    logger.info(f"=== UPLOAD_ANALYZE DEBUG START ===")
    logger.info(f"Request method: {request.method}")
    logger.info(f"FILES keys: {list(request.FILES.keys())}")
    
    f = request.FILES.get('image')
    if not f:
        logger.error("No image file found in request")
        messages.error(request, 'Vui lòng chọn file ảnh.')
        return redirect('search')
    
    logger.info(f"File info: name={f.name}, size={f.size}, content_type={f.content_type}")
    
    allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if f.content_type not in allowed or f.size > 10 * 1024 * 1024:
        logger.error(f"Invalid file: content_type={f.content_type}, size={f.size}")
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
    
    # Tìm Plant theo tên khoa học hoặc tên thường
    plant = Plant.objects.filter(
        Q(scientific_name__iexact=label) | Q(name__iexact=label)
    ).first()
    
    # Nếu không tìm thấy, tạo mới
    if not plant:
        plant = Plant.objects.create(
            scientific_name=label,
            name=label,
            should_save=True
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
def api_upload_analyze(request):
    """API endpoint: Upload ảnh và trả về kết quả phân tích dạng JSON"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    
    f = request.FILES.get('image')
    if not f:
        return JsonResponse({'success': False, 'error': 'No image file provided'}, status=400)
    
    # Validate file
    allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if f.content_type not in allowed:
        return JsonResponse({'success': False, 'error': 'Invalid file type. Only JPG, PNG, WebP allowed'}, status=400)
    
    if f.size > 10 * 1024 * 1024:
        return JsonResponse({'success': False, 'error': 'File too large. Max 10MB'}, status=400)
    
    try:
        # Read file
        data_bytes = f.read()
        
        # Call Pi API
        resp = pi_client.upload_image(data_bytes, f.name, f.content_type)
        
        if not resp.get('success'):
            error_msg = resp.get('error', 'Unknown error from Pi server')
            return JsonResponse({'success': False, 'error': error_msg}, status=500)
        
        # Return analysis result (same format as api_analyze_image)
        return JsonResponse({
            'success': True,
            'name': resp.get('name', ''),
            'confidence': resp.get('confidence', 0),
            'file': resp.get('file', ''),
            'image_url': resp.get('image_url', ''),
        })
        
    except Exception as e:
        logger.exception("Error in api_upload_analyze")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


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
        'system_presets': [
            'auto', 
            'leaf_sharp', 'leaf_vivid', 'leaf_macro', 'leaf_shadow',
            'daylight', 'cloudy', 'indoor', 'night',
            'sport', 'portrait', 'document', 'security'
        ]
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


# ============================================================
# YOLO LEAF DETECTION ENDPOINTS
# ============================================================

@csrf_exempt
@login_required
def api_detect_leaves(request):
    """API endpoint: Detect leaves in current stream using YOLO"""
    
    print("=== YOLO DETECT API CALLED - PRINT TEST ===")
    
    try:
        print("Step 1: Importing YOLO detector...")
        from .services.yolo_service import yolo_detector
        print("Step 2: YOLO detector imported successfully")
        
        logger.info("=== YOLO DETECT API CALLED ===")
        
        # Get stream URL
        print("Step 3: Getting stream URL...")
        logger.info("Getting stream URL from Pi client...")
        stream_url = pi_client.get_stream_url()
        print(f"Step 4: Stream URL = {stream_url}")
        logger.info(f"Stream URL: {stream_url}")
        
        if not stream_url:
            print("Step 5: Stream URL is empty - returning error")
            logger.warning("Stream URL is None or empty")
            return JsonResponse({"success": False, "error": "Stream không khả dụng"}, status=400)
        
        # Get confidence threshold from request
        confidence = float(request.GET.get('confidence', 0.5))
        confidence = max(0.1, min(0.9, confidence))  # Clamp between 0.1-0.9
        print(f"Step 6: Using confidence = {confidence}")
        logger.info(f"Using confidence threshold: {confidence}")
        
        # Run YOLO detection
        print("Step 7: Starting YOLO detection...")
        logger.info("Starting YOLO detection...")
        
        # Use YOLO service with snapshot capture
        print(f"Step 7a: Using Pi stream URL with snapshot capture: {stream_url}")
        
        result = yolo_detector.detect_leaves_from_url(stream_url, confidence)
        print(f"Step 8: YOLO detection completed with result: {result.get('success', False) if result else 'None'}")
        logger.info(f"YOLO detection result: {result.get('success', False) if result else 'None'}")
        
        print("Step 9: Returning JSON response")
        return JsonResponse(result)
        
    except Exception as e:
        print(f"EXCEPTION in api_detect_leaves: {str(e)}")
        logger.error(f"Leaf detection API error: {str(e)}", exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def api_crop_leaf(request):
    """API endpoint: Crop specific leaf from stream and analyze"""
    from .services.yolo_service import yolo_detector
    import json
    
    try:
        data = json.loads(request.body)
        bbox = data.get('bbox')
        
        if not bbox:
            return JsonResponse({"success": False, "error": "Bounding box không được cung cấp"}, status=400)
        
        # Validate bbox structure
        required_keys = ['x1', 'y1', 'x2', 'y2']
        if not all(key in bbox for key in required_keys):
            return JsonResponse({"success": False, "error": "Bounding box không hợp lệ"}, status=400)
        
        # Get stream URL
        stream_url = pi_client.get_stream_url()
        if not stream_url:
            return JsonResponse({"success": False, "error": "Stream không khả dụng"}, status=400)
        
        # Crop leaf from stream
        crop_result = yolo_detector.crop_leaf_from_stream(stream_url, bbox)
        
        if not crop_result['success']:
            return JsonResponse(crop_result, status=400)
        
        # Always save cropped image locally for later use
        try:
            import base64
            from django.core.files.base import ContentFile
            
            logger.info("Saving cropped image locally...")
            
            # Convert base64 to bytes
            cropped_image_data = base64.b64decode(crop_result['cropped_image_b64'])
            
            # Generate local filename
            timestamp = dj_timezone.now()
            local_filename = f"yolo_crop_{request.user.id}_{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
            local_path = f"yolo_crops/{timestamp:%Y/%m/%d}/{local_filename}"
            
            # Save to Django storage
            saved_path = default_storage.save(local_path, ContentFile(cropped_image_data))
            image_url = default_storage.url(saved_path)
            
            # Add file info to result
            crop_result['saved_file_path'] = saved_path
            crop_result['saved_file_url'] = image_url
            crop_result['saved_filename'] = local_filename
            
            logger.info(f"Cropped image saved locally: {saved_path}")
            
            # If auto_analyze is True, process immediately using upload_analyze logic
            auto_analyze = data.get('auto_analyze', False)
            if auto_analyze:
                logger.info("Auto-analyzing cropped leaf with upload_analyze logic...")
                
                # Use Pi client to upload and analyze
                pi_filename = f"yolo_crop_{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
                upload_result = pi_client.upload_image(cropped_image_data, pi_filename, 'image/jpeg')
                
                if upload_result.get('success'):
                    # Extract analysis results (same as upload_analyze logic)
                    label = (upload_result.get('name') or '').strip()
                    confidence = upload_result.get('confidence', 0)
                    
                    # Tìm Plant theo tên khoa học hoặc tên thường
                    plant = Plant.objects.filter(
                        Q(scientific_name__iexact=label) | Q(name__iexact=label)
                    ).first()
                    
                    # Nếu không tìm thấy, tạo mới
                    if not plant:
                        plant = Plant.objects.create(
                            scientific_name=label,
                            name=label,
                            should_save=True
                        )
                        created = True
                    else:
                        created = False
                    
                    # Save to database if plant should be saved
                    if plant.should_save:
                        capture_result = CaptureResult.objects.create(
                            user=request.user,
                            plant=plant,
                            name=label,
                            confidence=confidence,
                            image_file=upload_result.get('file', ''),
                            local_image=saved_path,
                            success=True,
                            source='yolo_crop',
                            raw=upload_result,
                        )
                        
                        crop_result['analysis'] = {
                            'name': label,
                            'confidence': confidence,
                            'plant_id': plant.id
                        }
                        crop_result['saved_to_history'] = True
                        crop_result['capture_id'] = capture_result.id
                        crop_result['message'] = f"Đã phân tích và lưu: {label} ({confidence:.1%})"
                    else:
                        crop_result['analysis'] = {
                            'name': label,
                            'confidence': confidence,
                            'plant_id': plant.id
                        }
                        crop_result['saved_to_history'] = False
                        crop_result['message'] = f"Đã phân tích: {label} ({confidence:.1%}) - Không lưu kết quả"
                else:
                    crop_result['analysis_error'] = upload_result.get('error', 'Pi analysis failed')
                    crop_result['message'] = f"Phân tích thất bại: {upload_result.get('error', 'Unknown error')}"
                    
        except Exception as e:
            logger.warning(f"Image saving/analysis failed: {str(e)}")
            crop_result['save_error'] = str(e)
        
        return JsonResponse(crop_result)
        
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON data"}, status=400)
    except Exception as e:
        logger.error(f"Crop leaf API error: {str(e)}")
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@login_required
@require_http_methods(["POST"]) 
def api_analyze_cropped_leaf(request):
    """API endpoint: Send cropped leaf to Pi for analysis"""
    import json
    import base64
    from django.core.files.base import ContentFile
    
    try:
        data = json.loads(request.body)
        image_b64 = data.get('image_b64')
        
        if not image_b64:
            return JsonResponse({"success": False, "error": "Không có ảnh để phân tích"}, status=400)
        
        # Decode base64 image
        try:
            image_data = base64.b64decode(image_b64)
        except Exception as e:
            return JsonResponse({"success": False, "error": "Ảnh không hợp lệ"}, status=400)
        
        # Send to Pi for analysis (integrate with existing Pi analysis pipeline)
        filename = f"yolo_crop_{dj_timezone.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        
        # Upload to Pi
        upload_result = pi_client.upload_image(image_data, filename, 'image/jpeg')
        
        if not upload_result.get('success'):
            return JsonResponse({
                "success": False, 
                "error": upload_result.get('error', 'Upload failed')
            }, status=400)
        
        # Analyze uploaded image
        analysis_result = pi_client.analyze_image(filename)
        
        if not analysis_result.get('success'):
            return JsonResponse({
                "success": False,
                "error": analysis_result.get('error', 'Analysis failed')
            }, status=400)
        
        # Save to database if successful and plant should be saved
        if analysis_result.get('success') and analysis_result.get('name'):
            try:
                plant = Plant.objects.filter(name__iexact=analysis_result['name']).first()
                
                if plant and plant.should_save:
                    # Save cropped image locally
                    image_file = ContentFile(image_data, filename)
                    
                    capture = CaptureResult.objects.create(
                        user=request.user,
                        plant=plant,
                        name=analysis_result['name'],
                        confidence=analysis_result.get('confidence'),
                        local_image=image_file,
                        source='yolo_crop',  # New source type
                        success=True,
                        raw=analysis_result
                    )
                    
                    analysis_result['saved'] = True
                    analysis_result['capture_id'] = capture.id
                else:
                    analysis_result['saved'] = False
                    analysis_result['reason'] = 'Plant not found or should_save=False'
                    
            except Exception as e:
                logger.warning(f"Failed to save YOLO crop result: {str(e)}")
                analysis_result['saved'] = False
                analysis_result['save_error'] = str(e)
        
        return JsonResponse(analysis_result)
        
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON data"}, status=400)
    except Exception as e:
        logger.error(f"Analyze cropped leaf error: {str(e)}")
        return JsonResponse({"success": False, "error": str(e)}, status=500)