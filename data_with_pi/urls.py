from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('register/', views.register, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.profile, name='profile'),
    path('profile/edit/', views.edit_profile, name='edit_profile'),
    path('history/', views.history, name='history'),
    path('search/', views.search, name='search'),
    path('upload/', views.upload_analyze, name='upload_analyze'), 
    path('plant/<int:plant_id>/', views.plant_detail, name='plant_detail'),
    path('recipe/<int:recipe_id>/', views.recipe_detail, name='recipe_detail'),
    
    # API endpoints cho AJAX
    path('api/capture/preview/', views.api_capture_preview, name='api_capture_preview'),
    path('api/capture/analyze/', views.api_analyze_image, name='api_analyze_image'),
    path('api/capture/save/', views.api_save_capture_result, name='api_save_capture_result'),
    path('api/status/', views.api_status, name='api_status'),
    path('api/stream/pause/', views.api_pause_stream, name='api_pause_stream'),
    path('api/stream/resume/', views.api_resume_stream, name='api_resume_stream'),
    path('api/settings/', views.api_get_settings, name='api_get_settings'),
    path('api/settings/mode/', views.api_set_mode, name='api_set_mode'),
    path('api/settings/camera/', views.api_get_camera_settings, name='api_get_camera_settings'),
    path('api/settings/camera/set/', views.api_set_camera_settings, name='api_set_camera_settings'),
    path('api/settings/preset/', views.api_apply_preset, name='api_apply_preset'),
    path('api/settings/presets/', views.api_get_presets, name='api_get_presets'),
    path('api/presets/user/', views.api_get_user_presets, name='api_get_user_presets'),
    path('api/presets/save/', views.api_save_preset, name='api_save_preset'),
    path('api/presets/load/', views.api_load_user_preset, name='api_load_user_preset'),
    path('api/presets/delete/', views.api_delete_preset, name='api_delete_preset'),
    path('api/control/restart_camera/', views.api_restart_camera, name='api_restart_camera'),
    path('api/control/reload_model/', views.api_reload_model, name='api_reload_model'),
    path('api/resolution/', views.api_get_resolution_info, name='api_get_resolution_info'),
    path('api/resolution/change/', views.api_change_resolution, name='api_change_resolution'),
    path('api/resolution/profiles/', views.api_get_resolution_profiles, name='api_get_resolution_profiles'),
    
    # UI Settings endpoints (user-friendly)
    path('api/ui/settings/definitions/', views.api_get_ui_settings_definitions, name='api_get_ui_settings_definitions'),
    path('api/ui/settings/current/', views.api_get_current_ui_settings, name='api_get_current_ui_settings'),
    path('api/ui/settings/apply/', views.api_apply_ui_settings, name='api_apply_ui_settings'),
        # Video recording endpoints (tạm thời)
    path('api/video/start/', views.api_start_video_recording, name='api_start_video_recording'),
    path('api/video/stop/', views.api_stop_video_recording, name='api_stop_video_recording'),
    path('api/video/status/', views.api_get_video_recording_status, name='api_get_video_recording_status'),
]