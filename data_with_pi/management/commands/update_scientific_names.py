"""
Management command to update scientific names to match Pi API output
"""
from django.core.management.base import BaseCommand
from data_with_pi.models import Plant


class Command(BaseCommand):
    help = 'Update scientific names in database to match Pi API predictions'

    def handle(self, *args, **options):
        # Mapping: old_scientific_name -> new_scientific_name (from Pi API)
        name_mapping = {
            'Aegle marmelos (L.) Corrêa': 'Aegle marmelos (L.) Corrêa (Wood apple)',
            'Andrographis paniculata (Burm.f.) Wall.': 'Andrographis paniculata (Burm.F.) Wall (Green Chirayta)',
            'Aquilaria malaccensis Lam.': 'Aquilaria malaccensis (Eagle wood)',
            'Bacopa monnieri (L.) Wettst': 'Bacopa monnieri (L.) Wettst (Water hyssop)',
            'Canna indica L.': 'Canna indica L. (Indian shot)',
            'Centella asiatica (L.) Urb.': 'Centella asiatica (L.) Urb (Asiatic pennywort)',
            'Cissus quadrangularis L.': 'Cissus quadrangularis L. (Devils backbone)',
            'Citrus aurantiifolia (Christm.) Swingle': 'Citrus aurantiifolia (Christm.) Swingle (Bitter orange)',
            'Clitoria ternatea L.': 'Clitoria ternatea L. (Asian pigeon wings)',
            'Eclipta prostrata Roxb.': 'Eclipta prostrata (False daisy)',
            'Eryngium foetidum L.': 'Eryngium foetidum L. (Culantro)',
            'Etlingera elatior (Jack) R.M.Sm.': 'Etlingera elatior (Jack) R.M.Sm. (Alpinia elatior)',
            'Hibiscus rosasinensis': 'Hibiscus rosasinensis (Red Hibiscus)',
            'Houttuynia cordata Thunb.': 'Houttuynia cordata (Fish mint)',
            'Kaempferia galanga L.': 'Kaempferia galanga (Aromatic ginger)',
            'Kalanchoe pinnata (Lam.) Pers.': 'Kalanchoe pinnata (Lam.) Pers (Miracle leaf)',
            'Lasia spinosa (L.) Thwaites': 'Lasia spinosa (L.) Thwaites (Lesia)',
            'Lawsonia inermis L.': 'Lawsonia inermis L. (Henna)',
            'Mentha arvensis L.': 'Mentha arvensis L. (Corn Mint)',
            'Murraya koenigii (L.) Spreng': 'Murraya koenigii (L.) (Curry leaves)',
            'Ocimum americanum L.': 'Ocimum americanum L. (Hoary basil)',
            'Ocimum tenuiflorum': 'Ocimum tenuiflorum (White holy basil)',
            'Opuntia vulgaris Mill': 'Opuntia vulgaris Mill (Prickly pear)',
            'Oxalis corniculata L.': 'Oxalis corniculata L. (Yellow Oxalis)',
            'Paederia foetida L.': 'Paederia foetida L. (Skunkvine)',
            'Passiflora edulis Sims': 'Passiflora edulis Sims (Passion fruit)',
            'Phyllanthus niruri L.': 'Phyllanthus niruri L. (Country gooseberry)',
            'Piper nigrum L.': 'Piper nigrum L. (Black Piper)',
            'Plectranthus amboinicus (Lour.) Spreng.': 'Plectranthus amboinicus (Lour.) Spreng. (Indian Borage)',
            'Psidium guajava L.': 'Psidium guajava L. (Guava Seed)',
            'Sapindus mukorossi Gaertn.': 'Sapindus mukorossi (Indian Soapberry)',
            'Senna alata (L.) Roxb.': 'Senna alata (L.) Roxb. (Ring worm shrub)',
            'Streblus asper Lour.': 'Streblus asper Lour. (Bar-inka)',
            'Syzygium cumini (L.) Skeels': 'Syzygium cumini (L.) Skeels (Malabar plum)',
        }

        updated_count = 0
        not_found_count = 0

        self.stdout.write(self.style.NOTICE('Starting scientific name update...'))

        for old_name, new_name in name_mapping.items():
            try:
                # Try exact match first
                plant = Plant.objects.filter(scientific_name=old_name).first()
                
                # If not found, try case-insensitive match
                if not plant:
                    plant = Plant.objects.filter(scientific_name__iexact=old_name).first()
                
                if plant:
                    old_scientific = plant.scientific_name
                    plant.scientific_name = new_name
                    plant.save()
                    updated_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'✓ Updated: "{old_scientific}" → "{new_name}"')
                    )
                else:
                    not_found_count += 1
                    self.stdout.write(
                        self.style.WARNING(f'✗ Not found: "{old_name}"')
                    )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'✗ Error updating "{old_name}": {str(e)}')
                )

        self.stdout.write(self.style.NOTICE('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS(f'Updated: {updated_count} plants'))
        self.stdout.write(self.style.WARNING(f'Not found: {not_found_count} plants'))
        self.stdout.write(self.style.NOTICE('='*60))
        
        # Also add Background and Green_but_not_leaf if they don't exist
        special_labels = ['Background', 'Green_but_not_leaf']
        for label in special_labels:
            plant, created = Plant.objects.get_or_create(
                scientific_name=label,
                defaults={
                    'name': label,
                    'should_save': False  # Don't save these to history
                }
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created special label: "{label}"')
                )
