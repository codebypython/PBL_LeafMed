import csv
import os
from django.core.management.base import BaseCommand
from data_with_pi.models import Plant, Recipe

class Command(BaseCommand):
    help = 'Load danh sách Recipes từ file CSV vào database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file', 
            type=str, 
            default='plant_recipes.csv', 
            help='Đường dẫn tới file plant_recipes.csv'
        )

    def handle(self, *args, **options):
        file_path = options['file']

        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f'Không tìm thấy file: {file_path}'))
            return

        self.stdout.write(f'Đang đọc file: {file_path}...')

        created_count = 0
        skipped_count = 0

        try:
            with open(file_path, mode='r', encoding='utf-8') as csv_file:
                reader = csv.DictReader(csv_file)
                
                for row in reader:
                    plant_name_csv = row['plant_name'].strip()
                    
                    # Tìm Plant tương ứng
                    try:
                        plant = Plant.objects.get(name__iexact=plant_name_csv)
                    except Plant.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f'Bỏ qua: Không tìm thấy cây "{plant_name_csv}" trong DB'))
                        skipped_count += 1
                        continue

                    recipe, created = Recipe.objects.update_or_create(
                        plant=plant,
                        name=row['name'].strip(),
                        defaults={
                            'recipe_type': row['recipe_type'].strip(),
                            'difficulty': row['difficulty'].strip(),
                            'usage_method': row['usage_method'].strip(),
                            'description': row['description'].strip(),
                            'treats': row['treats'].strip(),
                            'benefits': row['benefits'].strip(),
                            'main_ingredient': row['main_ingredient'].strip(),
                            'preparation_steps': row['preparation_steps'].strip(),
                            # Chuyển đổi string sang int an toàn
                            'preparation_time': int(row['preparation_time']) if row['preparation_time'].isdigit() else 0,
                            'dosage': row['dosage'].strip(),
                            'notes': row['notes'].strip(),
                            'is_verified': True, 
                            'source': 'Tổng hợp Y học cổ truyền'
                        }
                    )

                    if created:
                        created_count += 1
                        # self.stdout.write(self.style.SUCCESS(f'Đã tạo: {recipe.name} ({plant.name})'))
                    else:
                        # self.stdout.write(f'Đã cập nhật: {recipe.name} ({plant.name})')
                        pass

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Lỗi khi import: {str(e)}'))

        self.stdout.write(self.style.SUCCESS(f'\nHOÀN TẤT!'))
        self.stdout.write(f'- Tạo mới: {created_count}')
        self.stdout.write(f'- Bỏ qua (không tìm thấy cây): {skipped_count}')