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

class Recipe(models.Model):
    """Công thức thuốc từ cây"""
    RECIPE_TYPE_CHOICES = [
        ('tea', 'Trà/Nước sắc'),
        ('juice', 'Nước ép'),
        ('paste', 'Cao/Thuốc đắp'),
        ('powder', 'Bột'),
        ('oil', 'Tinh dầu'),
        ('tincture', 'Cồn thuốc'),
        ('syrup', 'Siro'),
        ('other', 'Khác'),
    ]
    
    DIFFICULTY_CHOICES = [
        ('easy', 'Dễ'),
        ('medium', 'Trung bình'),
        ('hard', 'Khó'),
    ]
    
    USAGE_METHOD_CHOICES = [
        ('oral', 'Uống'),
        ('topical', 'Bôi ngoài da'),
        ('inhale', 'Hít/Ngửi'),
        ('compress', 'Chườm'),
        ('gargle', 'Súc miệng'),
        ('bath', 'Ngâm tắm'),
    ]
    
    plant = models.ForeignKey('Plant', on_delete=models.CASCADE, related_name='recipes', verbose_name='Cây thuốc')
    name = models.CharField(max_length=255, verbose_name='Tên công thức')
    description = models.TextField(blank=True, default='', verbose_name='Mô tả')
    recipe_type = models.CharField(max_length=20, choices=RECIPE_TYPE_CHOICES, default='tea', verbose_name='Loại công thức')
    treats = models.TextField(blank=True, default='', verbose_name='Bệnh/Triệu chứng điều trị', 
                              help_text='Các bệnh hoặc triệu chứng mà công thức này có thể điều trị')
    benefits = models.TextField(blank=True, default='', verbose_name='Công dụng', 
                                help_text='Các lợi ích sức khỏe của công thức')
    main_ingredient = models.TextField(verbose_name='Nguyên liệu chính', 
                                       help_text='Phần của cây sử dụng và số lượng (VD: 20-30g lá tươi hoặc 10g lá khô)')
    additional_ingredients = models.TextField(blank=True, default='', verbose_name='Nguyên liệu phụ', 
                                             help_text='Các nguyên liệu khác cần thiết (nếu có)')
    preparation_steps = models.TextField(verbose_name='Cách chế biến', 
                                        help_text='Các bước chế biến chi tiết')
    preparation_time = models.IntegerField(null=True, blank=True, verbose_name='Thời gian chế biến (phút)', 
                                          help_text='Tổng thời gian cần để hoàn thành công thức')
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES, default='easy', verbose_name='Độ khó')
    usage_method = models.CharField(max_length=20, choices=USAGE_METHOD_CHOICES, verbose_name='Cách dùng')
    dosage = models.TextField(verbose_name='Liều lượng', 
                             help_text='Liều lượng và tần suất sử dụng (VD: Uống 2-3 lần/ngày, mỗi lần 100ml)')
    duration = models.CharField(max_length=255, blank=True, default='', verbose_name='Thời gian điều trị', 
                               help_text='Thời gian nên sử dụng (VD: 7-10 ngày)')
    storage = models.TextField(blank=True, default='', verbose_name='Bảo quản', 
                              help_text='Cách bảo quản và thời hạn sử dụng')
    warnings = models.TextField(blank=True, default='', verbose_name='Cảnh báo/Lưu ý', 
                               help_text='Các cảnh báo về tác dụng phụ, chống chỉ định, tương tác thuốc')
    contraindications = models.TextField(blank=True, default='', verbose_name='Chống chỉ định', 
                                        help_text='Những đối tượng không nên sử dụng (VD: Phụ nữ mang thai, trẻ em...)')
    notes = models.TextField(blank=True, default='', verbose_name='Ghi chú thêm', 
                            help_text='Các thông tin bổ sung, mẹo hay lưu ý khác')
    source = models.CharField(max_length=255, blank=True, default='', verbose_name='Nguồn', 
                             help_text='Nguồn tham khảo của công thức (sách, bài báo, dân gian...)')
    is_verified = models.BooleanField(default=False, verbose_name='Đã xác thực', 
                                     help_text='Công thức đã được chuyên gia xác thực')
    popularity = models.IntegerField(default=0, verbose_name='Độ phổ biến', 
                                    help_text='Số lượt xem hoặc sử dụng')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, 
                                  related_name='created_recipes', verbose_name='Người tạo')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Ngày tạo')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Ngày cập nhật')
    
    class Meta:
        verbose_name = 'Công thức thuốc'
        verbose_name_plural = 'Công thức thuốc'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['plant', '-created_at'], name='data_with_p_plant_i_9efaae_idx'),
            models.Index(fields=['recipe_type'], name='data_with_p_recipe__f9f6e3_idx'),
            models.Index(fields=['-popularity'], name='data_with_p_popular_5135d0_idx'),
        ]
    
    def __str__(self):
        return f'{self.name} - {self.plant.name}'