import csv
import os
from django.core.management.base import BaseCommand
from data_with_pi.models import Plant

class Command(BaseCommand):
    help = 'Load danh sách plants từ file CSV vào database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file', 
            type=str, 
            default='plants.csv', 
            help='Đường dẫn tới file plants.csv'
        )

    def handle(self, *args, **options):
        file_path = options['file']

        # Kiểm tra file có tồn tại không
        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f'Không tìm thấy file: {file_path}'))
            return

        self.stdout.write(f'Đang đọc file: {file_path}...')

        created_count = 0
        updated_count = 0

        try:
            with open(file_path, mode='r', encoding='utf-8') as csv_file:
                reader = csv.DictReader(csv_file)
                
                for row in reader:
                    # Sử dụng update_or_create để tránh trùng lặp nếu chạy lại script
                    # Nó sẽ tìm Plant theo 'name', nếu có rồi thì update các trường còn lại, chưa có thì tạo mới.
                    plant, created = Plant.objects.update_or_create(
                        name=row['name'].strip(),
                        defaults={
                            'scientific_name': row['scientific_name'].strip(),
                            'english_name': row['english_name'].strip(),
                            'vietnamese_name': row['vietnamese_name'].strip(),
                            'description': row['description'].strip(),
                            'biological_info': row['biological_info'].strip(),
                            'medicinal_info': row['medicinal_info'].strip(),
                            'usage': row['usage'].strip(),
                            'common_locations': row['common_locations'].strip(),
                            'should_save': True
                        }
                    )

                    if created:
                        created_count += 1
                        self.stdout.write(self.style.SUCCESS(f'Đã tạo mới: {plant.name}'))
                    else:
                        updated_count += 1
                        self.stdout.write(f'Đã cập nhật: {plant.name}')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Lỗi khi import: {str(e)}'))

        self.stdout.write(self.style.SUCCESS(f'\nHOÀN TẤT!'))
        self.stdout.write(f'- Tạo mới: {created_count}')
        self.stdout.write(f'- Cập nhật: {updated_count}')