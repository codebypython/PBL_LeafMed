from django.contrib import admin
from .models import Plant, CaptureResult, UserCameraPreset

@admin.register(Plant)
class PlantAdmin(admin.ModelAdmin):
    list_display = ('name', 'scientific_name', 'image', 'should_save', 'created_at')
    list_filter = ('should_save', 'created_at')
    search_fields = ('name', 'scientific_name', 'english_name', 'vietnamese_name')
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('name', 'scientific_name', 'english_name', 'vietnamese_name', 'image', 'should_save')
        }),
        ('Thông tin chi tiết', {
            'fields': ('description', 'usage', 'common_locations', 'biological_info', 'medicinal_info')
        }),
    )

@admin.register(CaptureResult)
class CaptureResultAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_plant_name', 'name', 'confidence', 'success', 'image_file', 'created_at')
    list_filter = ('success', 'created_at', 'plant')
    search_fields = ('name', 'image_file', 'plant__name')
    readonly_fields = ('raw', 'created_at')
    
    def get_plant_name(self, obj):
        """Hiển thị tên plant thay vì object"""
        return obj.plant.name if obj.plant else '-'
    get_plant_name.short_description = 'Plant'

@admin.register(UserCameraPreset)
class UserCameraPresetAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'is_default', 'created_at', 'updated_at')
    list_filter = ('is_default', 'created_at', 'user')
    search_fields = ('name', 'user__username')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('user', 'name', 'is_default')
        }),
        ('Cấu hình', {
            'fields': ('settings',)
        }),
        ('Thời gian', {
            'fields': ('created_at', 'updated_at')
        }),
    ) 