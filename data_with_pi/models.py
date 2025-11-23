from django.db import models
from django.contrib.auth.models import User

class Plant(models.Model):
    """Bảng lưu thông tin cây/thực vật"""
    name = models.CharField(max_length=255, unique=True)  # Tên tiếng Việt (chính)
    scientific_name = models.CharField(max_length=255, blank=True, default='')  # Tên khoa học
    english_name = models.CharField(max_length=255, blank=True, default='')  # Tên tiếng Anh
    vietnamese_name = models.CharField(max_length=255, blank=True, default='')  # Tên tiếng Việt (bổ sung)
    description = models.TextField(blank=True, default='')  # Mô tả chi tiết
    usage = models.TextField(blank=True, default='')  # Công dụng
    common_locations = models.TextField(blank=True, default='')  # Vị trí phân bố
    biological_info = models.TextField(blank=True, default='')  # Thông tin sinh học
    medicinal_info = models.TextField(blank=True, default='')  # Thông tin dược liệu
    should_save = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.scientific_name})'

class CaptureResult(models.Model):
    """Kết quả tra cứu - chỉ lưu khi plant.should_save = True"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='captures')
    plant = models.ForeignKey('Plant', on_delete=models.SET_NULL, null=True, blank=True, related_name='captures')
    name = models.CharField(max_length=255, blank=True, default='')
    confidence = models.FloatField(null=True, blank=True)
    image_file = models.CharField(max_length=255, blank=True, default='')  # tên file trên Pi
    local_image = models.ImageField(upload_to='captures/%Y/%m/%d/', null=True, blank=True)  # Ảnh lưu tại server
    source = models.CharField(max_length=16, default='pi', choices=[('pi', 'Pi Capture'), ('upload', 'User Upload')])
    success = models.BooleanField(default=False)
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['plant']),
            models.Index(fields=['user']), 
        ]

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M:%S} - {self.user.username} - {self.name} ({self.confidence})'

class UserCameraPreset(models.Model):
    """Preset camera do user tự tạo"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='camera_presets')
    name = models.CharField(max_length=255)
    settings = models.JSONField(default=dict)  # Lưu toàn bộ settings: framerate, controls, etc.
    is_default = models.BooleanField(default=False)  # Preset mặc định của user
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-is_default', 'name']
        unique_together = [['user', 'name']]  # Mỗi user không thể có 2 preset cùng tên
        indexes = [
            models.Index(fields=['user']),
        ]
    
    def __str__(self):
        return f'{self.user.username} - {self.name}'