from __future__ import annotations

import csv
import json
import re
from difflib import SequenceMatcher
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DataError, DatabaseError, transaction

from lab.models import (
    Department,
    Test,
    TestGroupItem,
    TestReferenceRange,
    TestResult,
    Visit,
    VisitTest,
)


class Command(BaseCommand):
    help = "Seed lab master data while preserving existing test pricing fields."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--report-dir",
            default="seed_reports",
            help="Directory where detailed text/PDF reports will be written.",
        )
        parser.add_argument(
            "--departments-file",
            default="departments.csv",
            help="Path to departments.csv (semicolon-delimited). Defaults to the project root or current directory.",
        )
        parser.add_argument(
            "--tests-file",
            default="cleaned_tests.csv",
            help="Path to cleaned_tests.csv (comma-delimited). Defaults to the project root or current directory.",
        )
        parser.add_argument(
            "--group-mappings-file",
            default="generated_group_mappings.json",
            help="Path to generated_group_mappings.json. Defaults to the project root or current directory.",
        )
        parser.add_argument(
            "--reference-ranges-file",
            default="reference_ranges_output.json",
            help="Path to reference_ranges_output.json. Defaults to the project root or current directory.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        self._errors: list[str] = []
        self._continue_on_error = True
        self._report_dir = self._resolve_report_dir(options["report_dir"])
        self._stats = {
            "departments": {"parsed": 0, "created": 0, "updated": 0, "skipped": 0},
            "tests": {"parsed": 0, "created": 0, "updated": 0, "skipped": 0},
            "group_mappings": {"parsed": 0, "saved": 0, "skipped": 0},
            "reference_ranges": {
                "parsed": 0,
                "saved": 0,
                "skipped": 0,
                "exact_matches": 0,
                "normalized_matches": 0,
                "overwrites": 0,
            },
        }

        departments_path = self._resolve_input_path(options["departments_file"])
        tests_path = self._resolve_input_path(options["tests_file"])
        group_mappings_path = self._resolve_input_path(options["group_mappings_file"])
        reference_ranges_path = self._resolve_input_path(options["reference_ranges_file"])

        self.stdout.write("Starting lab data seeding...")
        self.stdout.write(f"Departments file: {departments_path}")
        self.stdout.write(f"Tests file: {tests_path}")
        self.stdout.write(f"Group mappings file: {group_mappings_path}")
        self.stdout.write(f"Reference ranges file: {reference_ranges_path}")

        self.stdout.write("Clearing existing lab data...")
        self._clear_existing_data()

        self.stdout.write("Seeding departments...")
        departments_by_code, departments_by_name, departments_by_source_id = self._seed_departments(departments_path)

        self.stdout.write("Seeding tests...")
        tests_by_code, tests_by_name, tests_by_normalized_name, tests_by_compact_name, tests_by_fuzzy_name, tests_by_source_id = self._seed_tests(
            tests_path,
            departments_by_code,
            departments_by_name,
            departments_by_source_id,
        )

        self.stdout.write("Seeding test group mappings...")
        group_count = self._seed_group_mappings(
            group_mappings_path,
            tests_by_code,
            tests_by_name,
            tests_by_normalized_name,
            tests_by_compact_name,
            tests_by_fuzzy_name,
            tests_by_source_id,
        )

        self.stdout.write("Seeding reference ranges...")
        self._test_lookup_cache = self._build_test_lookup_cache()
        self._test_match_candidates = self._build_test_match_candidates()
        range_count = self._seed_reference_ranges(
            reference_ranges_path,
            self._test_lookup_cache,
        )

        self.stdout.write(self.style.SUCCESS("Lab data seeded successfully."))
        self.stdout.write(f"Departments processed: {len(departments_by_code)}")
        self.stdout.write(f"Tests processed: {len(tests_by_code)}")
        self.stdout.write(f"Group mappings saved: {group_count}")
        self.stdout.write(f"Reference range rows saved: {range_count}")
        if self._errors:
            self.stdout.write(self.style.WARNING(f"Skipped {len(self._errors)} row(s) with errors."))
            for error in self._errors:
                self.stdout.write(self.style.WARNING(f"  - {error}"))

        self._write_reports()

    def _clear_existing_data(self) -> None:
        TestResult.objects.all().delete()
        VisitTest.objects.all().delete()
        Visit.objects.all().delete()
        TestReferenceRange.objects.all().delete()
        TestGroupItem.objects.all().delete()

    def _seed_departments(
        self, file_path: Path
    ) -> tuple[dict[str, Department], dict[str, Department], dict[str, Department]]:
        rows = self._read_csv(file_path, delimiter=";")
        created_or_updated: dict[str, Department] = {}
        by_name: dict[str, Department] = {}
        by_source_id: dict[str, Department] = {}

        for index, row in enumerate(rows, start=1):
            self._stats["departments"]["parsed"] += 1
            try:
                source_id = self._first_non_empty(row, "id", "department_id", "source_id")
                code = self._first_non_empty(row, "department_code", "dept_code", "code", "department id")
                name = self._first_non_empty(row, "name", "department_name", "department")
                if not name:
                    raise CommandError(f"Department row {index} is missing a name: {row}")

                if not code:
                    code = self._make_fallback_code(name, prefix="DEPT", index=index, max_length=30)

                report_order = self._parse_positive_int(
                    self._first_non_empty(row, "report_order", "order", "sort_order"),
                    default=index,
                )
                is_active = self._parse_bool(self._first_non_empty(row, "is_active", "active"), default=True)

                department, was_created = Department.objects.update_or_create(
                    department_code=code,
                    defaults={
                        "name": name,
                        "report_order": report_order,
                        "is_active": is_active,
                    },
                )
                created_or_updated[code] = department
                by_name[name.casefold()] = department
                if source_id:
                    by_source_id[source_id] = department
                if was_created:
                    self._stats["departments"]["created"] += 1
                    self.stdout.write(f"  Created department: {code} - {name}")
                else:
                    self._stats["departments"]["updated"] += 1
                    self.stdout.write(f"  Updated department: {code} - {name}")
            except CommandError as exc:
                self._stats["departments"]["skipped"] += 1
                self._raise_or_collect(f"Department row {index}: {exc}")

        return created_or_updated, by_name, by_source_id

    def _seed_tests(
        self,
        file_path: Path,
        departments_by_code: dict[str, Department],
        departments_by_name: dict[str, Department],
        departments_by_source_id: dict[str, Department],
    ) -> tuple[dict[str, Test], dict[str, Test], dict[str, Test], dict[str, Test], dict[str, Test], dict[str, Test]]:
        rows = self._read_csv(file_path, delimiter=",")
        tests_by_code: dict[str, Test] = {}
        tests_by_name: dict[str, Test] = {}
        tests_by_normalized_name: dict[str, Test] = {}
        tests_by_compact_name: dict[str, Test] = {}
        tests_by_fuzzy_name: dict[str, Test] = {}
        tests_by_source_id: dict[str, Test] = {}

        for index, row in enumerate(rows, start=1):
            self._stats["tests"]["parsed"] += 1
            try:
                source_id = self._first_non_empty(row, "id", "test_id", "source_id")
                test_code = self._first_non_empty(row, "test_code", "code", "test id", "id")
                test_name = self._first_non_empty(row, "test_name", "name", "test", "test description")
                if not test_name:
                    raise CommandError(f"Test row {index} is missing a name: {row}")

                if not test_code:
                    test_code = self._make_fallback_code(test_name, prefix="T", index=index, max_length=30)

                department = self._resolve_department(
                    row,
                    departments_by_code,
                    departments_by_name,
                    departments_by_source_id,
                    index,
                )
                rate = self._parse_decimal(self._first_non_empty(row, "rate", "price", "amount"), default=Decimal("0"))
                default_discount_percent = self._parse_decimal(
                    self._first_non_empty(row, "default_discount_percent", "discount_percent", "discount"),
                    default=Decimal("0"),
                )
                default_amount = self._parse_decimal(
                    self._first_non_empty(row, "default_amount", "net_amount", "final_amount"),
                    default=Decimal("0"),
                )
                unit = self._first_non_empty(row, "unit", "units") or ""
                result_type = self._normalize_result_type(self._first_non_empty(row, "result_type", "type"))
                is_group = self._parse_bool(self._first_non_empty(row, "is_group", "group"), default=False)
                is_active = self._parse_bool(self._first_non_empty(row, "is_active", "active"), default=True)
                short_name = self._first_non_empty(row, "short_name", "short", "abbreviation") or test_name[:80]
                normalized_name = self._first_non_empty(row, "normalized_name")

                existing_test = Test.objects.filter(test_code=test_code).first()
                preserved_rate = existing_test.rate if existing_test is not None else rate
                preserved_discount = (
                    existing_test.default_discount_percent
                    if existing_test is not None
                    else default_discount_percent
                )
                preserved_amount = existing_test.default_amount if existing_test is not None else default_amount

                test, was_created = Test.objects.update_or_create(
                    test_code=test_code,
                    defaults={
                        "test_name": test_name,
                        "short_name": short_name,
                        "department": department,
                        "rate": preserved_rate,
                        "default_discount_percent": preserved_discount,
                        "default_amount": preserved_amount,
                        "unit": unit,
                        "result_type": result_type,
                        "is_group": is_group,
                        "is_active": is_active,
                    },
                )
                tests_by_code[test_code] = test
                tests_by_name[test.test_name.casefold()] = test
                if normalized_name:
                    tests_by_normalized_name[normalized_name.casefold()] = test
                tests_by_compact_name[self._compact_lookup_text(test.test_name)] = test
                if normalized_name:
                    tests_by_compact_name[self._compact_lookup_text(normalized_name)] = test
                tests_by_compact_name[self._compact_lookup_text(test.short_name or test.test_name)] = test
                tests_by_fuzzy_name[self._fuzzy_lookup_text(test.test_name)] = test
                if normalized_name:
                    tests_by_fuzzy_name[self._fuzzy_lookup_text(normalized_name)] = test
                if source_id:
                    tests_by_source_id[source_id] = test
                if was_created:
                    self._stats["tests"]["created"] += 1
                    self.stdout.write(f"  Created test: {test_code} - {test_name}")
                else:
                    self._stats["tests"]["updated"] += 1
                    self.stdout.write(f"  Updated test: {test_code} - {test_name}")
            except CommandError as exc:
                self._stats["tests"]["skipped"] += 1
                self._raise_or_collect(f"Test row {index}: {exc}")

        return (
            tests_by_code,
            tests_by_name,
            tests_by_normalized_name,
            tests_by_compact_name,
            tests_by_fuzzy_name,
            tests_by_source_id,
        )

    def _seed_group_mappings(
        self,
        file_path: Path,
        tests_by_code: dict[str, Test],
        tests_by_name: dict[str, Test],
        tests_by_normalized_name: dict[str, Test],
        tests_by_compact_name: dict[str, Test],
        tests_by_fuzzy_name: dict[str, Test],
        tests_by_source_id: dict[str, Test],
    ) -> int:
        payload = self._read_json(file_path)
        if not isinstance(payload, list):
            self._raise_or_collect("generated_group_mappings.json must contain a JSON array.")
            return 0

        saved_count = 0
        for index, item in enumerate(payload, start=1):
            self._stats["group_mappings"]["parsed"] += 1
            if not isinstance(item, dict):
                self._stats["group_mappings"]["skipped"] += 1
                self._raise_or_collect(f"Group mapping row {index} is not an object: {item!r}")
                continue

            parent_ref = item.get("parent_test_id") or item.get("parent_test") or item.get("parent")
            child_ref = item.get("child_test_id") or item.get("child_test") or item.get("child")
            if parent_ref is None or child_ref is None:
                self._stats["group_mappings"]["skipped"] += 1
                self._raise_or_collect(f"Group mapping row {index} must contain parent_test_id and child_test_id: {item}")
                continue

            try:
                parent_test = self._resolve_test(
                    parent_ref,
                    tests_by_code,
                    tests_by_name,
                    tests_by_normalized_name,
                    tests_by_compact_name,
                    tests_by_fuzzy_name,
                    tests_by_source_id,
                )
                child_test = self._resolve_test(
                    child_ref,
                    tests_by_code,
                    tests_by_name,
                    tests_by_normalized_name,
                    tests_by_compact_name,
                    tests_by_fuzzy_name,
                    tests_by_source_id,
                )
            except CommandError as exc:
                self._stats["group_mappings"]["skipped"] += 1
                self._raise_or_collect(f"Group mapping row {index}: {exc}")
                continue
            line_order = self._parse_positive_int(item.get("line_order"), default=index)

            if not parent_test.is_group or parent_test.result_type != Test.ResultType.PANEL:
                parent_test.is_group = True
                parent_test.result_type = Test.ResultType.PANEL
                parent_test.save(update_fields=["is_group", "result_type", "updated_at"])

            _, _ = TestGroupItem.objects.update_or_create(
                parent_test=parent_test,
                child_test=child_test,
                defaults={"line_order": line_order},
            )
            saved_count += 1
            self._stats["group_mappings"]["saved"] += 1
            self.stdout.write(
                f"  Group mapping saved: {parent_test.test_code} -> {child_test.test_code} (order {line_order})"
            )

        return saved_count

    def _seed_reference_ranges(
        self,
        file_path: Path,
        test_lookup_cache: dict[str, Test],
    ) -> int:
        payload = self._read_json(file_path)
        if not isinstance(payload, list):
            self._raise_or_collect("reference_ranges_output.json must contain a JSON array.")
            return 0

        saved_count = 0
        for index, item in enumerate(payload, start=1):
            self._stats["reference_ranges"]["parsed"] += 1
            if not isinstance(item, dict):
                self._stats["reference_ranges"]["skipped"] += 1
                self._raise_or_collect(f"Reference range row {index} is not an object: {item!r}")
                continue

            test_name = self._first_non_empty(item, "test_name", "name", "test")
            if not test_name:
                self._stats["reference_ranges"]["skipped"] += 1
                self._raise_or_collect(f"Reference range row {index} is missing a test name: {item}")
                continue

            try:
                test, match_mode = self._resolve_test_by_name(
                    test_name,
                    test_lookup_cache,
                )
            except CommandError as exc:
                self._stats["reference_ranges"]["skipped"] += 1
                self._raise_or_collect(f"Reference range row {index}: {exc}")
                continue
            if match_mode == "exact":
                self._stats["reference_ranges"]["exact_matches"] += 1
            elif match_mode == "normalized":
                self._stats["reference_ranges"]["normalized_matches"] += 1
                self._overwrite_normalized_test_name(test, test_name)
            unit = self._truncate_text(self._first_non_empty(item, "unit", "reference_unit"), 50)

            for gender, key in (
                (TestReferenceRange.Gender.MALE, "male_range"),
                (TestReferenceRange.Gender.FEMALE, "female_range"),
            ):
                raw_range = self._first_non_empty(item, key)
                if not raw_range:
                    continue

                operator, min_value, max_value, display_text = self._parse_reference_range_text(raw_range)
                display_text = self._truncate_text(display_text, 255)
                try:
                    _, was_created = TestReferenceRange.objects.update_or_create(
                        test=test,
                    gender=gender,
                    defaults={
                        "operator": operator,
                        "min_value": min_value,
                        "max_value": max_value,
                            "display_text": display_text,
                            "unit": unit,
                            "is_active": True,
                        },
                    )
                except (DataError, DatabaseError, ValueError, TypeError) as exc:
                    self._stats["reference_ranges"]["skipped"] += 1
                    self._raise_or_collect(f"Reference range row {index} ({gender}): {exc}")
                    continue
                saved_count += 1
                self._stats["reference_ranges"]["saved"] += 1
                action = "Created" if was_created else "Updated"
                self.stdout.write(
                    f"  {action} reference range: {test.test_code} ({gender}) -> {display_text}"
                )

        return saved_count

    def _resolve_input_path(self, raw_value: str) -> Path:
        candidate = Path(raw_value)
        search_paths: list[Path] = []

        if candidate.is_absolute():
            search_paths.append(candidate)
        else:
            search_paths.extend(
                [
                    Path.cwd() / candidate,
                    Path(settings.BASE_DIR) / candidate,
                    Path(settings.BASE_DIR).parent / candidate,
                ]
            )

        seen: set[str] = set()
        unique_paths: list[Path] = []
        for path in search_paths:
            resolved = str(path.resolve()) if path.exists() else str(path)
            if resolved not in seen:
                seen.add(resolved)
                unique_paths.append(path)

        for path in unique_paths:
            if path.exists():
                return path.resolve()

        searched = ", ".join(str(path) for path in unique_paths)
        raise CommandError(f"Could not find input file '{raw_value}'. Searched: {searched}")

    def _resolve_report_dir(self, raw_value: str) -> Path:
        candidate = Path(raw_value)
        if candidate.is_absolute():
            path = candidate
        else:
            path = Path.cwd() / candidate
        path.mkdir(parents=True, exist_ok=True)
        return path.resolve()

    def _raise_or_collect(self, message: str) -> None:
        if self._continue_on_error:
            self._errors.append(message)
            self.stdout.write(self.style.WARNING(message))
            return
        raise CommandError(message)

    def _build_test_lookup_cache(self) -> dict[str, Test]:
        cache: dict[str, Test] = {}
        for test in Test.objects.all():
            for candidate in (test.test_name, test.short_name, test.test_code):
                if not candidate:
                    continue
                cache[self.normalize_string(candidate)] = test
                cache[self._normalize_lookup_text(candidate)] = test
                cache[self._compact_lookup_text(candidate)] = test
                cache[self._semantic_alias_text(candidate)] = test
        return cache

    def _build_test_match_candidates(self) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        for test in Test.objects.all():
            texts = [test.test_name, test.short_name, test.test_code]
            normalized_forms = set()
            token_forms = set()
            acronyms = set()
            for text in texts:
                if not text:
                    continue
                normalized_forms.add(self.normalize_string(text))
                normalized_forms.add(self._normalize_lookup_text(text))
                normalized_forms.add(self._compact_lookup_text(text))
                normalized_forms.add(self._semantic_alias_text(text))
                tokens = self._semantic_tokens(text)
                token_forms.update(tokens)
                acronyms.add(self._acronym_from_tokens(tokens))
            candidates.append(
                {
                    "test": test,
                    "normalized_forms": {value for value in normalized_forms if value},
                    "tokens": token_forms,
                    "acronyms": {value for value in acronyms if value},
                }
            )
        return candidates

    def _write_reports(self) -> None:
        summary_lines = self._build_summary_lines()
        self._write_text_report(self._report_dir / "seed_lab_data_summary.pdf", "Lab Data Seed Summary", summary_lines)
        self._write_text_report(
            self._report_dir / "seed_lab_data_errors.pdf",
            "Lab Data Seed Errors",
            self._build_error_lines(),
        )
        self._write_text_report(
            self._report_dir / "departments.pdf",
            "Departments",
            self._build_table_lines(
                ["Code", "Name", "Order", "Active"],
                [
                    [
                        dept.department_code,
                        dept.name,
                        str(dept.report_order),
                        "Yes" if dept.is_active else "No",
                    ]
                    for dept in Department.objects.all()
                ],
            ),
        )
        self._write_text_report(
            self._report_dir / "tests.pdf",
            "Tests",
            self._build_table_lines(
                ["Code", "Name", "Dept", "Rate", "Disc%", "Amount", "Unit", "Type", "Group", "Active"],
                [
                    [
                        test.test_code,
                        test.test_name,
                        test.department.department_code,
                        self._fmt_decimal(test.rate),
                        self._fmt_decimal(test.default_discount_percent),
                        self._fmt_decimal(test.default_amount),
                        test.unit,
                        test.result_type,
                        "Yes" if test.is_group else "No",
                        "Yes" if test.is_active else "No",
                    ]
                    for test in Test.objects.select_related("department").all().order_by("department__report_order", "test_name")
                ],
            ),
        )
        self._write_text_report(
            self._report_dir / "reference_ranges.pdf",
            "Reference Ranges",
            self._build_table_lines(
                ["Test", "Gender", "Operator", "Min", "Max", "Display", "Unit", "Active"],
                [
                    [
                        ref.test.test_code,
                        ref.gender,
                        ref.operator,
                        self._fmt_decimal(ref.min_value),
                        self._fmt_decimal(ref.max_value),
                        ref.display_text,
                        ref.unit,
                        "Yes" if ref.is_active else "No",
                    ]
                    for ref in TestReferenceRange.objects.select_related("test").all()
                ],
            ),
        )
        self._write_text_report(
            self._report_dir / "test_group_items.pdf",
            "Test Group Items",
            self._build_table_lines(
                ["Parent", "Child", "Order"],
                [
                    [
                        item.parent_test.test_code,
                        item.child_test.test_code,
                        str(item.line_order),
                    ]
                    for item in TestGroupItem.objects.select_related("parent_test", "child_test").all()
                ],
            ),
        )
        self.stdout.write(self.style.SUCCESS(f"Reports written to: {self._report_dir}"))

    def _build_summary_lines(self) -> list[str]:
        lines = [
            f"Departments parsed: {self._stats['departments']['parsed']}",
            f"Departments created: {self._stats['departments']['created']}",
            f"Departments updated: {self._stats['departments']['updated']}",
            f"Departments skipped: {self._stats['departments']['skipped']}",
            "",
            f"Tests parsed: {self._stats['tests']['parsed']}",
            f"Tests created: {self._stats['tests']['created']}",
            f"Tests updated: {self._stats['tests']['updated']}",
            f"Tests skipped: {self._stats['tests']['skipped']}",
            "",
            f"Group mappings parsed: {self._stats['group_mappings']['parsed']}",
            f"Group mappings saved: {self._stats['group_mappings']['saved']}",
            f"Group mappings skipped: {self._stats['group_mappings']['skipped']}",
            "",
            f"Reference rows parsed: {self._stats['reference_ranges']['parsed']}",
            f"Reference rows saved: {self._stats['reference_ranges']['saved']}",
            f"Reference rows skipped: {self._stats['reference_ranges']['skipped']}",
            f"Reference exact matches: {self._stats['reference_ranges']['exact_matches']}",
            f"Reference normalized matches: {self._stats['reference_ranges']['normalized_matches']}",
            f"Normalized-name overwrites: {self._stats['reference_ranges']['overwrites']}",
            "",
            f"Errors collected: {len(self._errors)}",
            f"Report directory: {self._report_dir}",
        ]
        return lines

    def _build_error_lines(self) -> list[str]:
        if not self._errors:
            return ["No errors were collected."]
        return [f"{idx}. {error}" for idx, error in enumerate(self._errors, start=1)]

    def _build_table_lines(self, headers: list[str], rows: list[list[str]]) -> list[str]:
        if not rows:
            return ["No rows."]
        widths = [len(header) for header in headers]
        for row in rows:
            for idx, cell in enumerate(row):
                widths[idx] = min(max(widths[idx], len(cell)), 40)

        def format_row(values: list[str]) -> str:
            cells = []
            for idx, value in enumerate(values):
                text = value[: widths[idx]]
                cells.append(text.ljust(widths[idx]))
            return " | ".join(cells)

        lines = [format_row(headers), "-+-".join("-" * width for width in widths)]
        for row in rows:
            lines.append(format_row([cell.replace("\n", " ") for cell in row]))
        return lines

    def _write_text_report(self, path: Path, title: str, lines: list[str]) -> None:
        pdf_bytes = self._render_simple_pdf(title, lines)
        path.write_bytes(pdf_bytes)

    def _render_simple_pdf(self, title: str, lines: list[str]) -> bytes:
        page_width = 595
        page_height = 842
        margin_left = 36
        margin_top = 48
        font_size = 9
        line_height = 11
        max_lines_per_page = max(1, (page_height - (margin_top * 2)) // line_height)

        body_lines = [title, "=" * len(title), ""] + lines
        pages = [body_lines[i : i + max_lines_per_page] for i in range(0, len(body_lines), max_lines_per_page)]
        if not pages:
            pages = [[""]]

        objects: dict[int, bytes] = {}
        objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
        objects[3] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

        page_kids: list[str] = []
        for page_index, page_lines in enumerate(pages):
            content_obj_num = 4 + (page_index * 2)
            page_obj_num = content_obj_num + 1
            page_kids.append(f"{page_obj_num} 0 R")
            content_text = self._build_pdf_content_stream(
                page_lines,
                margin_left,
                page_height - margin_top,
                font_size,
                line_height,
            )
            objects[content_obj_num] = (
                f"<< /Length {len(content_text)} >>\nstream\n".encode("utf-8")
                + content_text
                + b"\nendstream"
            )
            objects[page_obj_num] = (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_num} 0 R >>"
            ).encode("utf-8")

        objects[2] = f"<< /Type /Pages /Kids [{' '.join(page_kids)}] /Count {len(pages)} >>".encode("utf-8")

        ordered_obj_nums = sorted(objects.keys())
        pdf = bytearray()
        pdf.extend(b"%PDF-1.4\n")
        offsets: dict[int, int] = {}
        for obj_num in ordered_obj_nums:
            offsets[obj_num] = len(pdf)
            pdf.extend(f"{obj_num} 0 obj\n".encode("utf-8"))
            pdf.extend(objects[obj_num])
            pdf.extend(b"\nendobj\n")

        xref_start = len(pdf)
        max_obj_num = max(ordered_obj_nums)
        pdf.extend(f"xref\n0 {max_obj_num + 1}\n".encode("utf-8"))
        pdf.extend(b"0000000000 65535 f \n")
        for obj_num in range(1, max_obj_num + 1):
            offset = offsets.get(obj_num, 0)
            pdf.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))

        pdf.extend(
            (
                f"trailer << /Size {max_obj_num + 1} /Root 1 0 R >>\n"
                f"startxref\n{xref_start}\n%%EOF"
            ).encode("utf-8")
        )
        return bytes(pdf)

    def _build_pdf_content_stream(
        self,
        lines: list[str],
        margin_left: int,
        start_y: int,
        font_size: int,
        line_height: int,
    ) -> bytes:
        commands = [
            "BT",
            f"/F1 {font_size} Tf",
            f"{margin_left} {start_y} Td",
        ]
        for idx, line in enumerate(lines):
            if idx > 0:
                commands.append(f"0 -{line_height} Td")
            commands.append(f"({self._escape_pdf_text(line)}) Tj")
        commands.append("ET")
        return "\n".join(commands).encode("utf-8")

    def _escape_pdf_text(self, value: str) -> str:
        return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def _fmt_decimal(self, value: Any) -> str:
        if value is None:
            return ""
        return self._stringify(value)

    def _truncate_text(self, value: Any, max_length: int) -> str:
        text = self._stringify(value)
        if len(text) <= max_length:
            return text
        return text[:max_length]

    def _read_csv(self, file_path: Path, delimiter: str) -> list[dict[str, str]]:
        with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter=delimiter)
            return [
                {self._normalize_key(key): (value.strip() if isinstance(value, str) else value) for key, value in row.items()}
                for row in reader
                if any((value or "").strip() for value in row.values() if isinstance(value, str))
            ]

    def _read_json(self, file_path: Path) -> Any:
        with file_path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)

    def _resolve_department(
        self,
        row: dict[str, Any],
        departments_by_code: dict[str, Department],
        departments_by_name: dict[str, Department],
        departments_by_source_id: dict[str, Department],
        index: int,
    ) -> Department:
        dept_code = self._first_non_empty(row, "department_code", "dept_code", "department id")
        dept_id = self._first_non_empty(row, "department_id", "departmentid", "dept_id", "id")
        dept_name = self._first_non_empty(row, "department_name", "department")

        if dept_id:
            department = departments_by_source_id.get(dept_id)
            if department:
                return department

        if dept_code:
            department = departments_by_code.get(dept_code)
            if department:
                return department

        if dept_name:
            department = departments_by_name.get(dept_name.casefold())
            if department:
                return department

        raise CommandError(f"Could not resolve department for test row {index}: {row}")

    def _resolve_test(
        self,
        ref: Any,
        tests_by_code: dict[str, Test],
        tests_by_name: dict[str, Test],
        tests_by_normalized_name: dict[str, Test],
        tests_by_compact_name: dict[str, Test],
        tests_by_fuzzy_name: dict[str, Test],
        tests_by_source_id: dict[str, Test],
    ) -> Test:
        if isinstance(ref, int):
            source_test = tests_by_source_id.get(str(ref))
            if source_test:
                return source_test
            test = Test.objects.filter(pk=ref).first()
            if test:
                return test
        elif isinstance(ref, str):
            stripped = ref.strip()
            source_test = tests_by_source_id.get(stripped)
            if source_test:
                return source_test
            if stripped.isdigit():
                source_test = tests_by_source_id.get(stripped)
                if source_test:
                    return source_test
                test = Test.objects.filter(pk=int(stripped)).first()
                if test:
                    return test
            test = tests_by_code.get(stripped) or tests_by_code.get(stripped.upper()) or tests_by_code.get(stripped.casefold())
            if test:
                return test
            test = tests_by_name.get(stripped.casefold())
            if test:
                return test
            test = tests_by_normalized_name.get(self._normalize_lookup_text(stripped))
            if test:
                return test
            test = tests_by_compact_name.get(self._compact_lookup_text(stripped))
            if test:
                return test
            test = tests_by_fuzzy_name.get(self._fuzzy_lookup_text(stripped))
            if test:
                return test
            test = Test.objects.filter(test_code__iexact=stripped).first()
            if test:
                return test
            test = Test.objects.filter(test_name__iexact=stripped).first()
            if test:
                return test

        raise CommandError(f"Could not resolve test reference: {ref!r}")

    def _resolve_test_by_name(
        self,
        test_name: str,
        test_lookup_cache: dict[str, Test],
    ) -> tuple[Test, str]:
        exact = Test.objects.filter(test_name=test_name).first()
        if exact:
            return exact, "exact"

        normalized = self.normalize_string(test_name)
        test = test_lookup_cache.get(normalized)
        if test:
            return test, "normalized"

        test = self._find_best_test_match(test_name)
        if test:
            return test, "fuzzy"

        test = Test.objects.filter(test_name__iexact=test_name).first()
        if test:
            return test, "iexact"

        raise CommandError(f"Could not find Test with name '{test_name}'.")

    def _overwrite_normalized_test_name(self, test: Test, display_name: str) -> None:
        if test.test_name != display_name:
            test.test_name = display_name
            test.save(update_fields=["test_name", "updated_at"])
            if hasattr(self, "_test_lookup_cache"):
                self._test_lookup_cache[self.normalize_string(display_name)] = test
                self._test_lookup_cache[self._normalize_lookup_text(display_name)] = test
                self._test_lookup_cache[self._compact_lookup_text(display_name)] = test
                self._test_lookup_cache[self._semantic_alias_text(display_name)] = test
            self._stats["reference_ranges"]["overwrites"] += 1

    def _parse_reference_range_text(self, raw_value: Any) -> tuple[str, Decimal | None, Decimal | None, str]:
        text = self._stringify(raw_value)
        cleaned = self._normalize_range_text(text)
        lowered = cleaned.casefold()

        text_keywords = (
            "negative",
            "non reactive",
            "non-reactive",
            "not reactive",
            "reactive",
            "positive",
            "present",
            "absent",
            "detected",
            "not detected",
            "trace",
        )
        if any(keyword in lowered for keyword in text_keywords) and not self._contains_numeric_range(cleaned):
            return TestReferenceRange.Operator.TEXT, None, None, cleaned

        between_match = re.search(
            r"(?P<min>-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?P<max>-?\d+(?:\.\d+)?)",
            cleaned,
            flags=re.IGNORECASE,
        )
        if between_match:
            return (
                TestReferenceRange.Operator.BETWEEN,
                Decimal(between_match.group("min")),
                Decimal(between_match.group("max")),
                cleaned,
            )

        le_match = re.search(r"^(?:<=|≤)\s*(?P<value>-?\d+(?:\.\d+)?)$", cleaned)
        if le_match:
            return TestReferenceRange.Operator.LTE, None, Decimal(le_match.group("value")), cleaned

        lt_match = re.search(r"^<\s*(?P<value>-?\d+(?:\.\d+)?)$", cleaned)
        if lt_match:
            return TestReferenceRange.Operator.LT, None, Decimal(lt_match.group("value")), cleaned

        ge_match = re.search(r"^(?:>=|≥)\s*(?P<value>-?\d+(?:\.\d+)?)$", cleaned)
        if ge_match:
            return TestReferenceRange.Operator.GTE, Decimal(ge_match.group("value")), None, cleaned

        gt_match = re.search(r"^>\s*(?P<value>-?\d+(?:\.\d+)?)$", cleaned)
        if gt_match:
            return TestReferenceRange.Operator.GT, Decimal(gt_match.group("value")), None, cleaned

        single_number_match = re.fullmatch(r"(?P<value>-?\d+(?:\.\d+)?)", cleaned)
        if single_number_match:
            value = Decimal(single_number_match.group("value"))
            return TestReferenceRange.Operator.BETWEEN, value, value, cleaned

        return TestReferenceRange.Operator.TEXT, None, None, cleaned

    def _normalize_range_text(self, value: str) -> str:
        cleaned = self._stringify(value)
        cleaned = cleaned.replace("\u2013", "-").replace("\u2014", "-")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _contains_numeric_range(self, value: str) -> bool:
        return bool(
            re.search(r"\d", value)
            and re.search(r"(?P<min>-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?P<max>-?\d+(?:\.\d+)?)", value, flags=re.IGNORECASE)
        )

    def _normalize_result_type(self, value: Any) -> str:
        if not value:
            return Test.ResultType.NUMERIC

        normalized = self._stringify(value).casefold()
        mapping = {
            "numeric": Test.ResultType.NUMERIC,
            "number": Test.ResultType.NUMERIC,
            "num": Test.ResultType.NUMERIC,
            "text": Test.ResultType.TEXT,
            "choice": Test.ResultType.CHOICE,
            "panel": Test.ResultType.PANEL,
        }
        if normalized in mapping:
            return mapping[normalized]
        return Test.ResultType.NUMERIC

    def _make_fallback_code(self, label: str, prefix: str, index: int, max_length: int) -> str:
        slug = re.sub(r"[^A-Za-z0-9]+", "", label.upper())
        suffix = f"{index:03d}"
        candidate = f"{prefix}{slug[: max_length - len(prefix) - len(suffix)]}{suffix}"
        return candidate[:max_length] or f"{prefix}{suffix}"

    def _parse_positive_int(self, value: Any, default: int | None = None) -> int | None:
        if value is None:
            return default
        if isinstance(value, int):
            return value
        text = self._stringify(value)
        if not text:
            return default
        try:
            parsed = int(float(text))
        except (TypeError, ValueError):
            return default
        return parsed

    def _parse_decimal(self, value: Any, default: Decimal | None = None) -> Decimal:
        if value is None:
            if default is None:
                return Decimal("0")
            return default

        if isinstance(value, Decimal):
            return value

        text = self._stringify(value)
        if not text:
            if default is None:
                return Decimal("0")
            return default

        try:
            return Decimal(text.replace(",", ""))
        except (InvalidOperation, ValueError) as exc:
            if default is not None:
                return default
            raise CommandError(f"Could not parse decimal value: {value!r}") from exc

    def _parse_bool(self, value: Any, default: bool = False) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        text = self._stringify(value).casefold()
        if text in {"1", "true", "yes", "y", "on", "active", "enabled"}:
            return True
        if text in {"0", "false", "no", "n", "off", "inactive", "disabled"}:
            return False
        return default

    def _first_non_empty(self, row: dict[str, Any], *keys: str) -> str:
        for key in keys:
            normalized_key = self._normalize_key(key)
            if normalized_key in row:
                value = row[normalized_key]
                if value is None:
                    continue
                text = self._stringify(value)
                if text:
                    return text
        return ""

    def _normalize_key(self, value: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
        return normalized.strip("_")

    def _normalize_lookup_text(self, value: str) -> str:
        text = self._stringify(value).casefold()
        text = re.sub(r"\([^)]*\)", " ", text)
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return " ".join(text.split())

    def normalize_string(self, text: str) -> str:
        normalized = self._stringify(text).casefold()
        normalized = re.sub(r"[\s\(\)\/,&\-]+", "", normalized)
        return normalized

    def _semantic_alias_text(self, value: str) -> str:
        tokens = self._semantic_tokens(value)
        return "".join(tokens)

    def _semantic_tokens(self, value: str) -> list[str]:
        stopwords = {
            "a",
            "ab",
            "abs",
            "acute",
            "all",
            "and",
            "antibody",
            "antibodies",
            "antigen",
            "assay",
            "by",
            "card",
            "cells",
            "check",
            "count",
            "detection",
            "diagnostic",
            "discrete",
            "eclia",
            "elisa",
            "every",
            "factor",
            "for",
            "free",
            "g",
            "ig",
            "iga",
            "igg",
            "igm",
            "indirect",
            "index",
            "level",
            "levels",
            "measurement",
            "n",
            "negative",
            "nonspecific",
            "panel",
            "pcr",
            "qualitative",
            "quantitative",
            "screening",
            "serum",
            "test",
            "the",
            "to",
            "titer",
            "titre",
            "trough",
            "urine",
            "with",
        }
        text = self._stringify(value).casefold()
        text = re.sub(r"\([^)]*\)", " ", text)
        text = text.replace("&", " ")
        raw_tokens = re.findall(r"[a-z0-9]+", text)
        tokens: list[str] = []
        for token in raw_tokens:
            if token in stopwords:
                continue
            if re.fullmatch(r"\d+", token):
                continue
            if re.fullmatch(r"\d+(?:day|days|week|weeks|month|months|year|years)", token):
                continue
            tokens.append(token)
        return tokens

    def _acronym_from_tokens(self, tokens: list[str]) -> str:
        acronym = "".join(token[0] for token in tokens if token)
        return acronym[:12]

    def _find_best_test_match(self, test_name: str) -> Test | None:
        query_forms = {
            self.normalize_string(test_name),
            self._normalize_lookup_text(test_name),
            self._compact_lookup_text(test_name),
            self._semantic_alias_text(test_name),
        }
        query_tokens = self._semantic_tokens(test_name)
        query_token_set = set(query_tokens)
        query_acronym = self._acronym_from_tokens(query_tokens)

        best_test: Test | None = None
        best_score = 0.0

        for candidate in self._test_match_candidates:
            candidate_test = candidate["test"]
            candidate_forms = candidate["normalized_forms"]
            if query_forms & candidate_forms:
                return candidate_test

            candidate_tokens: set[str] = candidate["tokens"]
            candidate_acronyms: set[str] = candidate["acronyms"]

            score = 0.0
            if query_token_set and candidate_tokens:
                overlap = len(query_token_set & candidate_tokens)
                union = len(query_token_set | candidate_tokens)
                score = max(score, overlap / union if union else 0.0)

            query_compact = self._compact_lookup_text(test_name)
            for form in candidate_forms:
                if query_compact and form:
                    ratio = SequenceMatcher(None, query_compact, form).ratio()
                    if ratio > score:
                        score = ratio

            for acronym in candidate_acronyms:
                if query_acronym and acronym and (query_acronym == acronym or query_acronym in acronym or acronym in query_acronym):
                    score = max(score, 0.85)

            if query_tokens and candidate_tokens:
                if query_tokens[0] == next(iter(candidate_tokens), ""):
                    score += 0.03

            if score > best_score:
                best_score = score
                best_test = candidate_test

        if best_score >= 0.72:
            return best_test
        if best_score >= 0.6 and len(test_name) <= 80:
            return best_test
        return None

    def _compact_lookup_text(self, value: str) -> str:
        text = self._stringify(value).casefold()
        text = re.sub(r"\([^)]*\)", " ", text)
        return re.sub(r"[^a-z0-9]+", "", text)

    def _fuzzy_lookup_text(self, value: str) -> str:
        stopwords = {
            "a",
            "an",
            "and",
            "anti",
            "by",
            "ab",
            "antibody",
            "assay",
            "for",
            "from",
            "in",
            "of",
            "on",
            "or",
            "the",
            "to",
            "with",
            "free",
            "day",
            "days",
            "dayss",
        }
        text = self._stringify(value).casefold()
        text = re.sub(r"\([^)]*\)", " ", text)
        tokens = re.findall(r"[a-z0-9]+", text)
        tokens = [
            token
            for token in tokens
            if token not in stopwords
            and not re.fullmatch(r"\d+", token)
            and not re.fullmatch(r"\d+(?:day|days|week|weeks)", token)
        ]
        return "".join(tokens)

    def _stringify(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return str(value).strip()
