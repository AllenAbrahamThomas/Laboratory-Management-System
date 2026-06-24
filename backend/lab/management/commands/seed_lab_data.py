from __future__ import annotations
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from django.core import serializers
from django.db import transaction

from accounts.models import LabUser, AccountHead, LoginSession, CashTransaction, JournalEntry, JournalLine
from lab.models import (
    Department,
    Doctor,
    Hospital,
    Unit,
    Test,
    TestComponent,
    TestGroupItem,
    TestReferenceRange,
    TestResult,
    Visit,
    VisitTest,
    Patient,
    ReagentItem,
    StockTransaction,
    Method,
    Technology,
    DiscountReason,
    SMSTemplate,
    LabCustomization,
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
        parser.add_argument(
            "--only-if-empty",
            action="store_true",
            help="Only run seeding if the Test table is empty",
        )

    def handle(self, *args, **options) -> None:
        fixture_path = Path(settings.BASE_DIR) / FIXTURE_FILE_NAME

        if options["dump"]:
            self.stdout.write("Dumping current database master data...")
            # Query models in dependency order
            users = list(LabUser.objects.all())
            account_heads = list(AccountHead.objects.all())
            departments = list(Department.objects.all())
            doctors = list(Doctor.objects.all())
            hospitals = list(Hospital.objects.all())
            units = list(Unit.objects.all())
            methods = list(Method.objects.all())
            technologies = list(Technology.objects.all())
            discount_reasons = list(DiscountReason.objects.all())
            sms_templates = list(SMSTemplate.objects.all())
            customizations = list(LabCustomization.objects.all())
            reagent_items = list(ReagentItem.objects.all())
            tests = list(Test.objects.all())
            components = list(TestComponent.objects.all())
            group_items = list(TestGroupItem.objects.all())
            reference_ranges = list(TestReferenceRange.objects.all())

            # Combine all objects in dependency order
            all_objects = (
                users
                + account_heads
                + departments
                + doctors
                + hospitals
                + units
                + methods
                + technologies
                + discount_reasons
                + sms_templates
                + customizations
                + reagent_items
                + tests
                + components
                + group_items
                + reference_ranges
            )
            
            # Serialize to JSON using Django's built-in serializer
            data = serializers.serialize("json", all_objects, indent=4)
            
            # Write to fixture file
            fixture_path.write_text(data, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Successfully dumped data to {fixture_path}"))
            return

        if options["only_if_empty"]:
            if Test.objects.exists():
                self.stdout.write("Database already contains tests. Skipping seeding.")
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
            JournalLine.objects.all().delete()
            JournalEntry.objects.all().delete()
            CashTransaction.objects.all().delete()
            StockTransaction.objects.all().delete()
            TestResult.objects.all().delete()
            VisitTest.objects.all().delete()
            Visit.objects.all().delete()
            Patient.objects.all().delete()
            LoginSession.objects.all().delete()

            # 2. Clear existing master settings tables
            self.stdout.write("Clearing existing master tables...")
            TestReferenceRange.objects.all().delete()
            TestGroupItem.objects.all().delete()
            TestComponent.objects.all().delete()
            Test.objects.all().delete()
            ReagentItem.objects.all().delete()
            LabCustomization.objects.all().delete()
            SMSTemplate.objects.all().delete()
            DiscountReason.objects.all().delete()
            Technology.objects.all().delete()
            Method.objects.all().delete()
            Unit.objects.all().delete()
            Hospital.objects.all().delete()
            Doctor.objects.all().delete()
            Department.objects.all().delete()
            AccountHead.objects.all().delete()
            LabUser.objects.all().delete()

            # 3. Deserialize and save from fixture
            self.stdout.write("Deserializing and saving new seed records...")
            import json
            raw_data = json.loads(fixture_data)
            
            # Get valid reagent IDs from the fixture data itself AND the database
            valid_reagent_ids = set()
            for item in raw_data:
                if item.get("model") == "lab.reagentitem":
                    valid_reagent_ids.add(item.get("pk"))
            valid_reagent_ids.update(ReagentItem.objects.values_list("id", flat=True))

            for item in raw_data:
                if item.get("model") == "lab.testreferencerange":
                    fields = item.get("fields", {})
                    if "gender" in fields:
                        gender_val = fields.pop("gender")
                        if gender_val == "any":
                            fields["reference_group"] = "COMMON"
                        else:
                            fields["reference_group"] = str(gender_val).upper()
            fixture_data_processed = json.dumps(raw_data)

            count = 0
            for obj in serializers.deserialize("json", fixture_data_processed):
                # Safety check for reagent_item foreign key
                if obj.object.__class__ == Test:
                    if obj.object.reagent_item_id and obj.object.reagent_item_id not in valid_reagent_ids:
                        obj.object.reagent_item_id = None
                        obj.object.reagent_quantity = None
                        obj.object.reagent_auto_reduce = False
                obj.save()
                count += 1

            self.stdout.write(self.style.SUCCESS(f"Successfully seeded {count} records into the database."))

