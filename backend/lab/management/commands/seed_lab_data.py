from __future__ import annotations
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from django.core import serializers
from django.db import transaction

from lab.models import (
    Department,
    Unit,
    Technology,
    Test,
    TestGroupItem,
    TestReferenceRange,
    TestResult,
    VisitTest,
    Visit,
)

FIXTURE_FILE_NAME = "lab_seed_data.json"

class Command(BaseCommand):
    help = "Seed or dump lab master settings data."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dump",
            action="store_true",
            help="Dump the current master tables from database into lab_seed_data.json",
        )

    def handle(self, *args, **options) -> None:
        fixture_path = Path(settings.BASE_DIR) / FIXTURE_FILE_NAME

        if options["dump"]:
            self.stdout.write("Dumping current database master data...")
            # Query models in dependency order
            departments = list(Department.objects.all())
            units = list(Unit.objects.all())
            technologies = list(Technology.objects.all())
            tests = list(Test.objects.all())
            group_items = list(TestGroupItem.objects.all())
            reference_ranges = list(TestReferenceRange.objects.all())

            # Combine all objects
            all_objects = departments + units + technologies + tests + group_items + reference_ranges
            
            # Serialize to JSON using Django's built-in serializer
            data = serializers.serialize("json", all_objects, indent=4)
            
            # Write to fixture file
            fixture_path.write_text(data, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Successfully dumped data to {fixture_path}"))
            return

        # Normal seeding flow (loading data)
        if not fixture_path.exists():
            self.stdout.write(self.style.ERROR(f"Seed fixture file not found at {fixture_path}"))
            self.stdout.write("Tip: Run this command with --dump first to generate the fixture from an existing database.")
            return

        self.stdout.write("Loading seed data fixture...")
        fixture_data = fixture_path.read_text(encoding="utf-8")

        with transaction.atomic():
            # 1. Clear existing transactional / patient data to avoid foreign key violations
            self.stdout.write("Clearing existing transaction/visit records...")
            TestResult.objects.all().delete()
            VisitTest.objects.all().delete()
            Visit.objects.all().delete()

            # 2. Clear existing master settings tables
            self.stdout.write("Clearing existing master tables...")
            TestReferenceRange.objects.all().delete()
            TestGroupItem.objects.all().delete()
            Test.objects.all().delete()
            Technology.objects.all().delete()
            Unit.objects.all().delete()
            Department.objects.all().delete()

            # Prepare reagent_item safety lookup
            from lab.models import ReagentItem
            valid_reagent_ids = set(ReagentItem.objects.values_list("id", flat=True))

            # 3. Deserialize and save from fixture
            self.stdout.write("Deserializing and saving new seed records...")
            count = 0
            for obj in serializers.deserialize("json", fixture_data):
                # Safety check for reagent_item foreign key
                if obj.object.__class__ == Test:
                    if obj.object.reagent_item_id and obj.object.reagent_item_id not in valid_reagent_ids:
                        obj.object.reagent_item_id = None
                        obj.object.reagent_quantity = None
                        obj.object.reagent_auto_reduce = False
                obj.save()
                count += 1

            self.stdout.write(self.style.SUCCESS(f"Successfully seeded {count} records into the database."))
