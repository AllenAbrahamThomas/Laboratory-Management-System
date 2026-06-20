from django.core.management.base import BaseCommand
from django.db import transaction
from lab.models import Test, Unit


class Command(BaseCommand):
    help = "Clear Unit table and populate it with unique values from the Test table unit column."

    @transaction.atomic
    def handle(self, *args, **options):
        # Delete existing unit data
        self.stdout.write("Deleting existing unit data...")
        deleted_count, _ = Unit.objects.all().delete()
        self.stdout.write(f"Deleted {deleted_count} existing unit(s).")

        # Find unique units from tests
        self.stdout.write("Scanning Test unit column...")
        test_units = Test.objects.exclude(unit="").exclude(unit__isnull=True).values_list("unit", flat=True).distinct()
        
        # Clean, strip and de-duplicate in memory
        unique_unit_names = sorted(list(set(name.strip() for name in test_units if name.strip())))
        
        # Recreate units
        self.stdout.write(f"Found {len(unique_unit_names)} unique unit(s) to reproduce.")
        created_count = 0
        for name in unique_unit_names:
            Unit.objects.create(name=name, is_active=True)
            created_count += 1
            self.stdout.write(f"  Created unit: {name}")

        self.stdout.write(self.style.SUCCESS(f"Successfully reproduced {created_count} unit(s) in Unit table."))
