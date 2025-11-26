from django.contrib import admin
from .models import Plant, CaptureResult, UserCameraPreset, Recipe, RecipeImage

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

class RecipeImageInline(admin.TabularInline):
    """Inline để thêm nhiều ảnh cho Recipe"""
    model = RecipeImage
    extra = 1  # Số form trống hiển thị
    fields = ('image', 'caption', 'order')
    ordering = ['order']


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('name', 'plant', 'recipe_type', 'difficulty', 'usage_method', 'is_verified', 'popularity', 'created_at')
    list_filter = ('recipe_type', 'difficulty', 'usage_method', 'is_verified', 'created_at')
    search_fields = ('name', 'plant__name', 'plant__scientific_name', 'treats', 'benefits')
    readonly_fields = ('created_at', 'updated_at', 'popularity')
    list_editable = ('is_verified',)
    inlines = [RecipeImageInline]  # Thêm inline để quản lý nhiều ảnh
    
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('plant', 'name', 'description', 'image', 'recipe_type', 'difficulty', 'is_verified')
        }),
        ('Công dụng', {
            'fields': ('treats', 'benefits')
        }),
        ('Nguyên liệu', {
            'fields': ('main_ingredient', 'additional_ingredients')
        }),
        ('Chế biến', {
            'fields': ('preparation_steps', 'preparation_time')
        }),
        ('Sử dụng', {
            'fields': ('usage_method', 'dosage', 'duration', 'storage')
        }),
        ('Cảnh báo', {
            'fields': ('warnings', 'contraindications')
        }),
        ('Thông tin khác', {
            'fields': ('notes', 'source', 'popularity', 'created_by')
        }),
        ('Thời gian', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('plant', 'created_by')


@admin.register(RecipeImage)
class RecipeImageAdmin(admin.ModelAdmin):
    """Quản lý ảnh công thức riêng (nếu cần)"""
    list_display = ('recipe', 'caption', 'order', 'uploaded_at')
    list_filter = ('uploaded_at', 'recipe__plant')
    search_fields = ('recipe__name', 'caption')
    ordering = ['recipe', 'order'] 