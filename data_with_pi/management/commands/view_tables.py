from django.core.management.base import BaseCommand
from data_with_pi.models import Plant, Recipe, CaptureResult, UserCameraPreset
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Xem dữ liệu trong các tables'

    def add_arguments(self, parser):
        parser.add_argument(
            'table',
            type=str,
            nargs='?',
            default='all',
            choices=['plant', 'recipe', 'capture', 'preset', 'user', 'all'],
            help='Table cần xem: plant, recipe, capture, preset, user, hoặc all'
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=10,
            help='Số lượng records hiển thị (mặc định: 10)'
        )
        parser.add_argument(
            '--full',
            action='store_true',
            help='Hiển thị đầy đủ thông tin chi tiết'
        )

    def handle(self, *args, **options):
        table = options['table']
        limit = options['limit']
        full = options['full']
        
        # Plant Table
        if table == 'plant' or table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('PLANT TABLE'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            
            plants = Plant.objects.all()[:limit]
            total = Plant.objects.count()
            
            if plants.exists():
                for plant in plants:
                    self.stdout.write(self.style.SUCCESS(f'\n[ID: {plant.id}]'))
                    self.stdout.write(f'  Tên: {plant.name}')
                    self.stdout.write(f'  Tên khoa học: {plant.scientific_name}')
                    self.stdout.write(f'  Tên tiếng Anh: {plant.english_name}')
                    self.stdout.write(f'  Should Save: {plant.should_save}')
                    
                    if full:
                        self.stdout.write(f'  Mô tả: {plant.description[:100]}...')
                        self.stdout.write(f'  Công dụng: {plant.usage[:100]}...')
                        self.stdout.write(f'  Vị trí: {plant.common_locations[:100]}...')
                        self.stdout.write(f'  Số recipes: {plant.recipes.count()}')
                        self.stdout.write(f'  Số captures: {plant.captures.count()}')
                    
                    self.stdout.write(f'  Ngày tạo: {plant.created_at.strftime("%Y-%m-%d %H:%M")}')
            else:
                self.stdout.write(self.style.WARNING('  (Không có dữ liệu)'))
            
            self.stdout.write(self.style.SUCCESS(f'\n  Tổng: {total} plants (hiển thị {plants.count()})'))
        
        # Recipe Table
        if table == 'recipe' or table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('RECIPE TABLE'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            
            recipes = Recipe.objects.select_related('plant', 'created_by').all()[:limit]
            total = Recipe.objects.count()
            
            if recipes.exists():
                for recipe in recipes:
                    self.stdout.write(self.style.SUCCESS(f'\n[ID: {recipe.id}]'))
                    self.stdout.write(f'  Tên: {recipe.name}')
                    self.stdout.write(f'  Cây: {recipe.plant.name}')
                    self.stdout.write(f'  Loại: {recipe.get_recipe_type_display()}')
                    self.stdout.write(f'  Cách dùng: {recipe.get_usage_method_display()}')
                    self.stdout.write(f'  Độ khó: {recipe.get_difficulty_display()}')
                    
                    if full:
                        self.stdout.write(f'  Mô tả: {recipe.description[:100]}...')
                        self.stdout.write(f'  Điều trị: {recipe.treats[:100]}...')
                        self.stdout.write(f'  Nguyên liệu chính: {recipe.main_ingredient[:100]}...')
                        self.stdout.write(f'  Thời gian: {recipe.preparation_time} phút' if recipe.preparation_time else '  Thời gian: N/A')
                        self.stdout.write(f'  Độ phổ biến: {recipe.popularity}')
                    
                    self.stdout.write(f'  Xác thực: {"✓" if recipe.is_verified else "✗"}')
                    self.stdout.write(f'  Người tạo: {recipe.created_by.username if recipe.created_by else "N/A"}')
                    self.stdout.write(f'  Ngày tạo: {recipe.created_at.strftime("%Y-%m-%d %H:%M")}')
            else:
                self.stdout.write(self.style.WARNING('  (Không có dữ liệu)'))
            
            self.stdout.write(self.style.SUCCESS(f'\n  Tổng: {total} recipes (hiển thị {recipes.count()})'))
        
        # CaptureResult Table
        if table == 'capture' or table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('CAPTURE RESULT TABLE'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            
            captures = CaptureResult.objects.select_related('user', 'plant').all()[:limit]
            total = CaptureResult.objects.count()
            
            if captures.exists():
                for capture in captures:
                    self.stdout.write(self.style.SUCCESS(f'\n[ID: {capture.id}]'))
                    self.stdout.write(f'  User: {capture.user.username if capture.user else "N/A"}')
                    self.stdout.write(f'  Plant: {capture.plant.name if capture.plant else "N/A"}')
                    self.stdout.write(f'  Name: {capture.name}')
                    self.stdout.write(f'  Confidence: {capture.confidence:.2%}' if capture.confidence else '  Confidence: N/A')
                    self.stdout.write(f'  Source: {capture.get_source_display()}')
                    self.stdout.write(f'  Success: {"✓" if capture.success else "✗"}')
                    
                    if full:
                        self.stdout.write(f'  Image: {capture.image_file}')
                        self.stdout.write(f'  Local Image: {capture.local_image.name if capture.local_image else "N/A"}')
                    
                    self.stdout.write(f'  Ngày tạo: {capture.created_at.strftime("%Y-%m-%d %H:%M")}')
            else:
                self.stdout.write(self.style.WARNING('  (Không có dữ liệu)'))
            
            self.stdout.write(self.style.SUCCESS(f'\n  Tổng: {total} captures (hiển thị {captures.count()})'))
        
        # UserCameraPreset Table
        if table == 'preset' or table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('USER CAMERA PRESET TABLE'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            
            presets = UserCameraPreset.objects.select_related('user').all()[:limit]
            total = UserCameraPreset.objects.count()
            
            if presets.exists():
                for preset in presets:
                    self.stdout.write(self.style.SUCCESS(f'\n[ID: {preset.id}]'))
                    self.stdout.write(f'  User: {preset.user.username}')
                    self.stdout.write(f'  Name: {preset.name}')
                    self.stdout.write(f'  Default: {"✓" if preset.is_default else "✗"}')
                    
                    if full:
                        self.stdout.write(f'  Settings: {preset.settings}')
                    
                    self.stdout.write(f'  Ngày tạo: {preset.created_at.strftime("%Y-%m-%d %H:%M")}')
            else:
                self.stdout.write(self.style.WARNING('  (Không có dữ liệu)'))
            
            self.stdout.write(self.style.SUCCESS(f'\n  Tổng: {total} presets (hiển thị {presets.count()})'))
        
        # User Table
        if table == 'user' or table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('USER TABLE'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            
            users = User.objects.all()[:limit]
            total = User.objects.count()
            
            if users.exists():
                for user in users:
                    self.stdout.write(self.style.SUCCESS(f'\n[ID: {user.id}]'))
                    self.stdout.write(f'  Username: {user.username}')
                    self.stdout.write(f'  Email: {user.email}')
                    self.stdout.write(f'  Full Name: {user.get_full_name() or "N/A"}')
                    self.stdout.write(f'  Staff: {"✓" if user.is_staff else "✗"}')
                    self.stdout.write(f'  Active: {"✓" if user.is_active else "✗"}')
                    
                    if full:
                        self.stdout.write(f'  Số captures: {user.captures.count()}')
                        self.stdout.write(f'  Số recipes tạo: {user.created_recipes.count()}')
                        self.stdout.write(f'  Số presets: {user.camera_presets.count()}')
                    
                    self.stdout.write(f'  Ngày tham gia: {user.date_joined.strftime("%Y-%m-%d %H:%M")}')
                    self.stdout.write(f'  Lần đăng nhập cuối: {user.last_login.strftime("%Y-%m-%d %H:%M") if user.last_login else "Chưa đăng nhập"}')
            else:
                self.stdout.write(self.style.WARNING('  (Không có dữ liệu)'))
            
            self.stdout.write(self.style.SUCCESS(f'\n  Tổng: {total} users (hiển thị {users.count()})'))
        
        # Summary
        if table == 'all':
            self.stdout.write(self.style.HTTP_INFO('\n' + '='*80))
            self.stdout.write(self.style.HTTP_INFO('TỔNG QUAN'))
            self.stdout.write(self.style.HTTP_INFO('='*80))
            self.stdout.write(f'  Plants: {Plant.objects.count()}')
            self.stdout.write(f'  Recipes: {Recipe.objects.count()}')
            self.stdout.write(f'  Captures: {CaptureResult.objects.count()}')
            self.stdout.write(f'  Presets: {UserCameraPreset.objects.count()}')
            self.stdout.write(f'  Users: {User.objects.count()}')
        
        self.stdout.write(self.style.SUCCESS('\n✓ HOÀN TẤT!\n'))

"""
# Xem tất cả tables (10 records đầu tiên mỗi table)
python manage.py view_tables

# Xem chỉ table Plant
python manage.py view_tables plant

# Xem 20 records
python manage.py view_tables plant --limit 20

# Xem đầy đủ thông tin chi tiết
python manage.py view_tables plant --full

# Xem tất cả tables với thông tin đầy đủ
python manage.py view_tables all --full --limit 5

# Xem table Recipe
python manage.py view_tables recipe

# Xem Capture Results
python manage.py view_tables capture

# Xem User Presets
python manage.py view_tables preset

# Xem Users
python manage.py view_tables user
"""