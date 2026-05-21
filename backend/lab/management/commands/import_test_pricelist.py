from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from pypdf import PdfReader

from lab.models import Department, Test, Unit


PRICE_ROW_RE = re.compile(
    r"(\d+)([A-Za-z][\s\S]*?)([\d,]+\.\d{2})([A-Z][A-Z/ &\-]+?)\s+(\d+\.\d{2})\s+([\d,]+\.\d{2})(?=\d+[A-Za-z]|$)"
)

HEADER_NOISE = (
    "TEST NAME",
    "PRICE",
    "SL.NO",
    "TEST PRICE LIST",
    "Neethi Clinical Lab",
    "Eraviperoor",
    "DISC.PER",
    "AMOUNT",
    "DEPARTMENT",
)


class Command(BaseCommand):
    help = "Import test prices and units from PDF files into lab masters."

    def add_arguments(self, parser):
        parser.add_argument("--test-pdf", required=True, help="Path to test price list PDF")
        parser.add_argument("--units-pdf", required=True, help="Path to units list PDF")
        parser.add_argument("--start-code", default=1, type=int, help="Starting serial for generated TEST codes")

    @transaction.atomic
    def handle(self, *args, **options):
        test_pdf = Path(options["test_pdf"])
        units_pdf = Path(options["units_pdf"])
        start_code = options["start_code"]

        if not test_pdf.exists():
            raise CommandError(f"Test PDF not found: {test_pdf}")
        if not units_pdf.exists():
            raise CommandError(f"Units PDF not found: {units_pdf}")

        units_created, units_updated = self._import_units(units_pdf)
        tests_created, tests_updated, depts_created = self._import_tests(test_pdf, start_code)

        self.stdout.write(self.style.SUCCESS("Import completed."))
        self.stdout.write(f"Departments created: {depts_created}")
        self.stdout.write(f"Units created/updated: {units_created}/{units_updated}")
        self.stdout.write(f"Tests created/updated: {tests_created}/{tests_updated}")

    def _extract_pdf_text(self, pdf_path: Path) -> str:
        reader = PdfReader(str(pdf_path))
        chunks: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text:
                chunks.append(text)
        return "\n".join(chunks)

    def _import_units(self, units_pdf: Path) -> tuple[int, int]:
        text = " ".join((self._extract_pdf_text(units_pdf) or "").split())
        cleaned = text
        for token in HEADER_NOISE + ("Units List", "Sl No", "Units"):
            cleaned = cleaned.replace(token, " ")
        cleaned = " ".join(cleaned.split())

        # Unit serials in this report are continuous from 1..189.
        serial_positions: list[tuple[int, int]] = []
        cursor = 0
        for serial in range(1, 190):
            m = re.search(rf"(?<!\d){serial}(?!\d)", cleaned[cursor:])
            if not m:
                continue
            absolute_pos = cursor + m.start()
            serial_positions.append((serial, absolute_pos))
            cursor = absolute_pos + 1

        unit_names = set()
        for idx, (serial, start_pos) in enumerate(serial_positions):
            next_pos = serial_positions[idx + 1][1] if idx + 1 < len(serial_positions) else len(cleaned)
            start_token = str(serial)
            segment = cleaned[start_pos + len(start_token) : next_pos]
            candidate = " ".join(segment.split()).strip(" -:")
            if not candidate or len(candidate) > 100:
                continue
            unit_names.add(candidate)

        created = 0
        updated = 0
        for name in sorted(unit_names):
            _, was_created = Unit.objects.update_or_create(
                name=name,
                defaults={"is_active": True},
            )
            if was_created:
                created += 1
            else:
                updated += 1
        return created, updated

    def _import_tests(self, test_pdf: Path, start_code: int) -> tuple[int, int, int]:
        parsed_rows = []
        for page in PdfReader(str(test_pdf)).pages:
            page_text = " ".join((page.extract_text() or "").split())
            for m in PRICE_ROW_RE.finditer(page_text):
                raw_serial, raw_name, raw_price, raw_dept, raw_disc, raw_amount = m.groups()
                if len(raw_serial) > 4:
                    # Skip phone-number artifacts and similar OCR joins.
                    continue
                name = " ".join(raw_name.split()).strip()[:180]
                if not name or len(name) < 2:
                    continue

                dept_name = " ".join(raw_dept.split()).strip()[:120]
                try:
                    price = self._to_decimal(raw_price)
                    discount_percent = self._to_decimal(raw_disc)
                    amount = self._to_decimal(raw_amount)
                except InvalidOperation:
                    continue

                parsed_rows.append((name, dept_name, price, discount_percent, amount))

        deduped: dict[tuple[str, str], tuple[str, str, Decimal, Decimal, Decimal]] = {}
        for row in parsed_rows:
            key = (row[0].lower(), row[1].lower())
            deduped[key] = row

        dept_cache: dict[str, Department] = {}
        dept_created = 0
        tests_created = 0
        tests_updated = 0
        next_code = start_code

        for name, dept_name, price, discount_percent, amount in deduped.values():
            dept_key = dept_name.upper()
            if dept_key not in dept_cache:
                dept_code = re.sub(r"[^A-Z0-9]", "", dept_key)[:30] or "GENERAL"
                dept, was_created = Department.objects.get_or_create(
                    department_code=dept_code,
                    defaults={
                        "name": dept_name.title(),
                        "report_order": 999,
                        "is_active": True,
                    },
                )
                if not was_created and dept.name != dept_name.title():
                    dept.name = dept_name.title()
                    dept.is_active = True
                    dept.save(update_fields=["name", "is_active", "updated_at"])
                dept_cache[dept_key] = dept
                if was_created:
                    dept_created += 1

            dept = dept_cache[dept_key]
            test = Test.objects.filter(test_name__iexact=name, department=dept).first()
            if test is None:
                while True:
                    code = f"TP{next_code:04d}"
                    next_code += 1
                    if not Test.objects.filter(test_code=code).exists():
                        break
                Test.objects.create(
                    test_code=code,
                    test_name=name,
                    short_name=name[:80],
                    department=dept,
                    rate=price,
                    default_discount_percent=discount_percent,
                    default_amount=amount,
                    unit="",
                    result_type=Test.ResultType.NUMERIC,
                    is_group=False,
                    is_active=True,
                )
                tests_created += 1
            else:
                test.rate = price
                test.default_discount_percent = discount_percent
                test.default_amount = amount
                test.is_active = True
                test.save(
                    update_fields=[
                        "rate",
                        "default_discount_percent",
                        "default_amount",
                        "is_active",
                        "updated_at",
                    ]
                )
                tests_updated += 1

        return tests_created, tests_updated, dept_created

    @staticmethod
    def _to_decimal(value: str) -> Decimal:
        return Decimal(value.replace(",", "").strip())
