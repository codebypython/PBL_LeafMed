from django.core.management.base import BaseCommand
from data_with_pi.models import Plant

PLANTS_DATA = [
    {"name": "Aloevera", "should_save": True},
    {"name": "Amla", "should_save": True},
    {"name": "Amruthaballi", "should_save": True},
    {"name": "Arali", "should_save": True},
    {"name": "Background", "should_save": False},  # không lưu
    {"name": "Badipala", "should_save": True},
    {"name": "Bamboo", "should_save": True},
    {"name": "Beans", "should_save": True},
    {"name": "Betel", "should_save": True},
    {"name": "Bhrami", "should_save": True},
    {"name": "Caricature", "should_save": True},
    {"name": "Castor", "should_save": True},
    {"name": "Catharanthus", "should_save": True},
    {"name": "Chilly", "should_save": True},
    {"name": "Citron lime (herelikai)", "should_save": True},
    {"name": "Coffee", "should_save": True},
    {"name": "Coriender", "should_save": True},
    {"name": "Curry", "should_save": True},
    {"name": "Doddpathre", "should_save": True},
    {"name": "Drumstick", "should_save": True},
    {"name": "Ekka", "should_save": True},
    {"name": "Eucalyptus", "should_save": True},
    {"name": "Guava", "should_save": True},
    {"name": "Hibiscus", "should_save": True},
    {"name": "Honge", "should_save": True},
    {"name": "Insulin", "should_save": True},
    {"name": "Jackfruit", "should_save": True},
    {"name": "Jasmine", "should_save": True},
    {"name": "Kalanchoe Pinnata", "should_save": True},
    {"name": "Lantana", "should_save": True},
    {"name": "Lemon", "should_save": True},
    {"name": "Lemongrass", "should_save": True},
    {"name": "Malabar_Nut", "should_save": True},
    {"name": "Malabar_Spinach", "should_save": True},
    {"name": "Mango", "should_save": True},
    {"name": "Marigold", "should_save": True},
    {"name": "Mint", "should_save": True},
    {"name": "Neem", "should_save": True},
    {"name": "Nelavembu", "should_save": True},
    {"name": "Onion", "should_save": True},
    {"name": "Oxalis", "should_save": True},
    {"name": "Palak(Spinach)", "should_save": True},
    {"name": "Papaya", "should_save": True},
    {"name": "Pea", "should_save": True},
    {"name": "Pepper", "should_save": True},
    {"name": "Pomoegranate", "should_save": True},
    {"name": "Pumpkin", "should_save": True},
    {"name": "Radish", "should_save": True},
    {"name": "Rose", "should_save": True},
    {"name": "Seethapala", "should_save": True},
    {"name": "Tamarind", "should_save": True},
    {"name": "Taro", "should_save": True},
    {"name": "Tomato", "should_save": True},
    {"name": "Tulsi", "should_save": True},
    {"name": "Turmeric", "should_save": True},
]

class Command(BaseCommand):
    help = 'Seed database với danh sách plants từ model AI'

    def handle(self, *args, **options):
        created = 0
        for item in PLANTS_DATA:
            plant, is_new = Plant.objects.get_or_create(
                name=item['name'],
                defaults={'should_save': item['should_save']}
            )
            if is_new:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'Đã tạo: {plant.name}'))
            else:
                self.stdout.write(f'Đã tồn tại: {plant.name}')
        self.stdout.write(self.style.SUCCESS(f'\nTổng: {created} plants mới được tạo'))