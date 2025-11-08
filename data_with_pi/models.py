from django.db import models
from django.contrib.auth.models import User

class Plant(models.Model):
    """Bảng lưu thông tin cây/thực vật"""
    name = models.CharField(max_length=255, unique=True)
    scientific_name = models.CharField(max_length=255, blank=True, default='')
    biological_info = models.TextField(blank=True, default='')  
    medicinal_info = models.TextField(blank=True, default='') 
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