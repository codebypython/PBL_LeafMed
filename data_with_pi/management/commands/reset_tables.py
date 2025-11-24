from django.core.management.base import BaseCommand
from data_with_pi.models import Plant, Recipe, CaptureResult

class Command(BaseCommand):
    help = 'Reset dữ liệu của một table'

    def add_arguments(self, parser):
        parser.add_argument(
            'table',
            type=str,
            choices=['plant', 'recipe', 'capture', 'all'],
            help='Table cần reset: plant, recipe, capture, hoặc all'
        )

    def handle(self, *args, **options):
        table = options['table']
        
        if table == 'plant' or table == 'all':
            count = Plant.objects.count()
            Plant.objects.all().delete()
            self.stdout.write(self.style.SUCCESS(f'✓ Đã xóa {count} plants'))
        
        if table == 'recipe' or table == 'all':
            count = Recipe.objects.count()
            Recipe.objects.all().delete()
            self.stdout.write(self.style.SUCCESS(f'✓ Đã xóa {count} recipes'))
        
        if table == 'capture' or table == 'all':
            count = CaptureResult.objects.count()
            CaptureResult.objects.all().delete()
            self.stdout.write(self.style.SUCCESS(f'✓ Đã xóa {count} capture results'))
        
        self.stdout.write(self.style.SUCCESS('\n✓ HOÀN TẤT!'))