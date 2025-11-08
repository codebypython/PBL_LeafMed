from django.contrib import admin
from .models import Plant, CaptureResult

@admin.register(Plant)
class PlantAdmin(admin.ModelAdmin):
    list_display = ('name', 'scientific_name', 'should_save', 'created_at')
    list_filter = ('should_save', 'created_at')
    search_fields = ('name', 'scientific_name')
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('name', 'scientific_name', 'should_save')
        }),
        ('Thông tin chi tiết', {
            'fields': ('biological_info', 'medicinal_info')
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