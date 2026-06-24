from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from lab.models import (
    Department,
    Doctor,
    Hospital,
    Patient,
    Test,
    TestGroupItem,
    TestReferenceRange,
    TestResult,
    Visit,
    VisitTest,
)


@dataclass(frozen=True)
class VisitLine:
    test_code: str
    discount_percent: Decimal


class Command(BaseCommand):
    help = "Seeds mock lab master data, visits, visit tests, and sample results."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing lab app data before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if options["clear"]:
            self._clear_existing_data()

        departments = self._seed_departments()
        doctors = self._seed_doctors()
        hospitals = self._seed_hospitals()
        patients = self._seed_patients()
        tests = self._seed_tests(departments)
        self._seed_test_groups(tests)
        self._seed_reference_ranges(tests)
        visits = self._seed_visits(patients, doctors, hospitals)
        self._seed_visit_tests_and_results(visits, tests)

        self.stdout.write(self.style.SUCCESS("Mock lab data seeded successfully."))

    def _clear_existing_data(self) -> None:
        TestResult.objects.all().delete()
        VisitTest.objects.all().delete()
        Visit.objects.all().delete()
        TestReferenceRange.objects.all().delete()
        TestGroupItem.objects.all().delete()
        Test.objects.all().delete()
        Patient.objects.all().delete()
        Doctor.objects.all().delete()
        Hospital.objects.all().delete()
        Department.objects.all().delete()

    def _seed_departments(self) -> dict[str, Department]:
        payload = [
            ("BIO", "Biochemistry", 1),
            ("HEM", "Hematology", 2),
            ("SER", "Serology", 3),
            ("MIC", "Microbiology", 4),
        ]
        records: dict[str, Department] = {}
        for code, name, order in payload:
            records[code], _ = Department.objects.update_or_create(
                department_code=code,
                defaults={
                    "name": name,
                    "report_order": order,
                    "is_active": True,
                },
            )
        return records

    def _seed_doctors(self) -> dict[str, Doctor]:
        payload = [
            ("DOC001", "Dr. Anil Kumar", "9495001101", "Town Clinic, Eraviperoor"),
            ("DOC002", "Dr. Neena Thomas", "9495001102", "Care Medical Centre"),
            ("DOC003", "Dr. Biju Mathew", "9495001103", "Community Health Point"),
        ]
        records: dict[str, Doctor] = {}
        for code, name, phone, address in payload:
            records[code], _ = Doctor.objects.update_or_create(
                doctor_code=code,
                defaults={
                    "name": name,
                    "phone": phone,
                    "address": address,
                    "is_active": True,
                },
            )
        return records

    def _seed_hospitals(self) -> dict[str, Hospital]:
        payload = [
            ("HSP001", "Neethi Medical Centre", "04692956001", "Eraviperoor"),
            ("HSP002", "MediCare Hospital", "04692956002", "Thiruvalla"),
            ("HSP003", "St. George Clinic", "04692956003", "Kozhencherry"),
        ]
        records: dict[str, Hospital] = {}
        for code, name, phone, address in payload:
            records[code], _ = Hospital.objects.update_or_create(
                hospital_code=code,
                defaults={
                    "name": name,
                    "phone": phone,
                    "address": address,
                    "is_active": True,
                },
            )
        return records

    def _seed_patients(self) -> dict[str, Patient]:
        payload = [
            ("PAT001", "Abraham Eapen", Patient.Gender.MALE, 77, 0, "9495866214", "Mannarakkal House, Eraviperoor"),
            ("PAT002", "Reshmi Manoj", Patient.Gender.FEMALE, 19, 0, "9562177260", "Kizhakkethil House, Thiruvalla"),
            ("PAT003", "Arya Suresh", Patient.Gender.FEMALE, 32, 0, "9847012233", "Market Road, Pathanamthitta"),
            ("PAT004", "Vijayan Pillai", Patient.Gender.MALE, 58, 0, "9847023344", "Puthenpurackal, Tiruvalla"),
            ("PAT005", "Meera Joseph", Patient.Gender.FEMALE, 8, 6, "9847034455", "St. Mary's Lane, Kozhencherry"),
        ]
        records: dict[str, Patient] = {}
        for code, full_name, gender, age_years, age_months, phone, address in payload:
            records[code], _ = Patient.objects.update_or_create(
                patient_code=code,
                defaults={
                    "full_name": full_name,
                    "gender": gender,
                    "age_years": age_years,
                    "age_months": age_months,
                    "phone": phone,
                    "address": address,
                },
            )
        return records

    def _seed_tests(self, departments: dict[str, Department]) -> dict[str, Test]:
        payload = [
            ("T001", "Blood Sugar Fasting", "BSF", "BIO", "30.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T002", "Blood Sugar PPBS", "PPBS", "BIO", "30.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T003", "Complete Haemogram", "CBC", "HEM", "280.00", "", Test.ResultType.PANEL, True),
            ("T004", "Erythrocyte Sedimentation Rate", "ESR", "HEM", "50.00", "mm/hr", Test.ResultType.NUMERIC, False),
            ("T005", "Uric Acid", "Uric Acid", "BIO", "120.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T006", "Thyroid Function Tests", "TFT", "BIO", "300.00", "", Test.ResultType.PANEL, True),
            ("T007", "Vitamin - D3", "Vitamin D3", "BIO", "950.00", "ng/mL", Test.ResultType.NUMERIC, False),
            ("T008", "Lipid Profile", "Lipid", "BIO", "350.00", "", Test.ResultType.PANEL, True),
            ("T009", "Bilirubin - Total", "Bilirubin Total", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T010", "Bilirubin - Direct", "Bilirubin Direct", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T011", "Bilirubin Indirect", "Bilirubin Indirect", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T012", "SGOT / AST", "SGOT", "BIO", "0.00", "U/L", Test.ResultType.NUMERIC, False),
            ("T013", "SGPT / ALT", "SGPT", "BIO", "0.00", "U/L", Test.ResultType.NUMERIC, False),
            ("T014", "Alkaline Phosphatase", "ALP", "BIO", "0.00", "IU/L", Test.ResultType.NUMERIC, False),
            ("T015", "Total Protein", "Total Protein", "BIO", "0.00", "gm/dL", Test.ResultType.NUMERIC, False),
            ("T016", "Albumin", "Albumin", "BIO", "0.00", "gm/dL", Test.ResultType.NUMERIC, False),
            ("T017", "Globulins", "Globulins", "BIO", "0.00", "gm/dL", Test.ResultType.NUMERIC, False),
            ("T018", "A/G Ratio", "A/G Ratio", "BIO", "0.00", "", Test.ResultType.NUMERIC, False),
            ("T019", "Urea", "Urea", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T020", "Creatinine", "Creatinine", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T021", "Total Cholesterol", "Cholesterol", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T022", "Triglycerides", "Triglycerides", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T023", "HDL Cholesterol", "HDL", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T024", "LDL Cholesterol", "LDL", "BIO", "0.00", "mg/dL", Test.ResultType.NUMERIC, False),
            ("T025", "T3", "T3", "BIO", "0.00", "ng/mL", Test.ResultType.NUMERIC, False),
            ("T026", "T4", "T4", "BIO", "0.00", "ug/dL", Test.ResultType.NUMERIC, False),
            ("T027", "TSH", "TSH", "BIO", "0.00", "uIU/mL", Test.ResultType.NUMERIC, False),
            ("T028", "Hemoglobin", "Hb", "HEM", "0.00", "g/dL", Test.ResultType.NUMERIC, False),
            ("T029", "Total Count", "TC", "HEM", "0.00", "cells/cumm", Test.ResultType.NUMERIC, False),
            ("T030", "Platelet Count", "Platelet", "HEM", "0.00", "lakhs/cumm", Test.ResultType.NUMERIC, False),
        ]
        records: dict[str, Test] = {}
        for code, name, short_name, dept_code, rate, unit, result_type, is_group in payload:
            records[code], _ = Test.objects.update_or_create(
                test_code=code,
                defaults={
                    "test_name": name,
                    "short_name": short_name,
                    "department": departments[dept_code],
                    "rate": Decimal(rate),
                    "unit": unit,
                    "result_type": result_type,
                    "is_group": is_group,
                    "is_active": True,
                },
            )
        return records

    def _seed_test_groups(self, tests: dict[str, Test]) -> None:
        groups = {
            "T003": ["T028", "T029", "T030"],
            "T006": ["T025", "T026", "T027"],
            "T008": ["T021", "T022", "T023", "T024"],
        }
        for parent_code, child_codes in groups.items():
            for order, child_code in enumerate(child_codes, start=1):
                TestGroupItem.objects.update_or_create(
                    parent_test=tests[parent_code],
                    child_test=tests[child_code],
                    defaults={"line_order": order},
                )

    def _seed_reference_ranges(self, tests: dict[str, Test]) -> None:
        ranges = [
            ("T001", TestReferenceRange.ReferenceGroup.COMMON, "between", "70", "100", "", "mg/dL"),
            ("T002", TestReferenceRange.ReferenceGroup.COMMON, "between", "90", "140", "", "mg/dL"),
            ("T005", TestReferenceRange.ReferenceGroup.MALE, "between", "3.6", "7.2", "", "mg/dL"),
            ("T005", TestReferenceRange.ReferenceGroup.FEMALE, "between", "2.5", "6.5", "", "mg/dL"),
            ("T009", TestReferenceRange.ReferenceGroup.COMMON, "between", "0.1", "1.2", "", "mg/dL"),
            ("T010", TestReferenceRange.ReferenceGroup.COMMON, "text", None, None, "upto 0.25", "mg/dL"),
            ("T011", TestReferenceRange.ReferenceGroup.COMMON, "between", "0.2", "0.6", "", "mg/dL"),
            ("T012", TestReferenceRange.ReferenceGroup.FEMALE, "lt", None, "40", "", "U/L"),
            ("T012", TestReferenceRange.ReferenceGroup.MALE, "lt", None, "40", "", "U/L"),
            ("T013", TestReferenceRange.ReferenceGroup.FEMALE, "lt", None, "34", "", "U/L"),
            ("T013", TestReferenceRange.ReferenceGroup.MALE, "lt", None, "45", "", "U/L"),
            ("T014", TestReferenceRange.ReferenceGroup.MALE, "lt", None, "128", "", "U/L"),
            ("T014", TestReferenceRange.ReferenceGroup.FEMALE, "lt", None, "141", "", "U/L"),
            ("T014", TestReferenceRange.ReferenceGroup.COMMON, "lt", None, "390", "Children : <390 U/L (below 14 Years of Age)", "U/L"),
            ("T015", TestReferenceRange.ReferenceGroup.COMMON, "between", "6.6", "8.8", "", "gm/dL"),
            ("T016", TestReferenceRange.ReferenceGroup.COMMON, "between", "3.5", "5.2", "", "gm/dL"),
            ("T017", TestReferenceRange.ReferenceGroup.COMMON, "between", "1.8", "3.4", "", "gm/dL"),
            ("T018", TestReferenceRange.ReferenceGroup.COMMON, "text", None, None, "2:1", ""),
            ("T019", TestReferenceRange.ReferenceGroup.COMMON, "between", "15", "50", "", "mg/dL"),
            ("T020", TestReferenceRange.ReferenceGroup.FEMALE, "between", "0.6", "1.1", "", "mg/dL"),
            ("T020", TestReferenceRange.ReferenceGroup.MALE, "between", "0.9", "1.3", "", "mg/dL"),
            ("T021", TestReferenceRange.ReferenceGroup.COMMON, "between", "125", "200", "", "mg/dL"),
            ("T022", TestReferenceRange.ReferenceGroup.COMMON, "between", "0", "150", "", "mg/dL"),
            ("T023", TestReferenceRange.ReferenceGroup.COMMON, "gt", "40", None, "", "mg/dL"),
            ("T024", TestReferenceRange.ReferenceGroup.COMMON, "between", "0", "130", "", "mg/dL"),
            ("T025", TestReferenceRange.ReferenceGroup.COMMON, "between", "0.8", "2.0", "", "ng/mL"),
            ("T026", TestReferenceRange.ReferenceGroup.COMMON, "between", "5.0", "12.0", "", "ug/dL"),
            ("T027", TestReferenceRange.ReferenceGroup.COMMON, "between", "0.4", "4.5", "", "uIU/mL"),
            ("T028", TestReferenceRange.ReferenceGroup.FEMALE, "between", "12.0", "15.0", "", "g/dL"),
            ("T028", TestReferenceRange.ReferenceGroup.MALE, "between", "13.0", "17.0", "", "g/dL"),
        ]
        for item in ranges:
            (
                test_code,
                ref_group,
                operator,
                min_value,
                max_value,
                display_text,
                unit,
            ) = item
            TestReferenceRange.objects.update_or_create(
                test=tests[test_code],
                reference_group=ref_group,
                operator=operator,
                defaults={
                    "min_value": Decimal(min_value) if min_value is not None else None,
                    "max_value": Decimal(max_value) if max_value is not None else None,
                    "display_text": display_text,
                    "unit": unit,
                    "is_active": True,
                },
            )

    def _seed_visits(
        self,
        patients: dict[str, Patient],
        doctors: dict[str, Doctor],
        hospitals: dict[str, Hospital],
    ) -> dict[str, Visit]:
        today = timezone.localdate()
        visit_payload = [
            {
                "lab_no": "NCL-38582",
                "patient": patients["PAT001"],
                "visit_date": date(2026, 4, 29),
                "sample_on": self._local_dt(2026, 4, 29, 10, 15),
                "ip_no": "",
                "doctor": doctors["DOC001"],
                "out_doctor_name": "",
                "hospital": hospitals["HSP001"],
                "corporate_name": "",
                "pay_mode": Visit.PayMode.CASH,
                "discount_mode": Visit.DiscountMode.NORMAL,
                "discount_percent": Decimal("0"),
                "discount_reason": "",
                "note": "Biochemistry panel follow-up.",
                "round_off": Decimal("0"),
                "gross_amount": Decimal("0"),
                "net_amount": Decimal("0"),
                "received_amount": Decimal("0"),
                "balance_amount": Decimal("0"),
                "status": Visit.Status.AUTHORIZED,
            },
            {
                "lab_no": "NCL-38715",
                "patient": patients["PAT002"],
                "visit_date": date(2026, 5, 14),
                "sample_on": self._local_dt(2026, 5, 14, 7, 46),
                "ip_no": "",
                "doctor": None,
                "out_doctor_name": "SELF",
                "hospital": None,
                "corporate_name": "",
                "pay_mode": Visit.PayMode.CASH,
                "discount_mode": Visit.DiscountMode.NORMAL,
                "discount_percent": Decimal("0"),
                "discount_reason": "",
                "note": "Walk-in routine profile.",
                "round_off": Decimal("0"),
                "gross_amount": Decimal("0"),
                "net_amount": Decimal("0"),
                "received_amount": Decimal("0"),
                "balance_amount": Decimal("0"),
                "status": Visit.Status.RESULT_ENTERED,
            },
            {
                "lab_no": "NCL-38801",
                "patient": patients["PAT003"],
                "visit_date": today - timedelta(days=2),
                "sample_on": timezone.now() - timedelta(days=2, hours=1),
                "ip_no": "OP-2041",
                "doctor": doctors["DOC002"],
                "out_doctor_name": "",
                "hospital": hospitals["HSP002"],
                "corporate_name": "Care Plus",
                "pay_mode": Visit.PayMode.CARD,
                "discount_mode": Visit.DiscountMode.CORPORATE,
                "discount_percent": Decimal("10.00"),
                "discount_reason": "Corporate tie-up",
                "note": "Corporate wellness screening.",
                "round_off": Decimal("0"),
                "gross_amount": Decimal("0"),
                "net_amount": Decimal("0"),
                "received_amount": Decimal("0"),
                "balance_amount": Decimal("0"),
                "status": Visit.Status.REGISTERED,
            },
            {
                "lab_no": "NCL-38812",
                "patient": patients["PAT004"],
                "visit_date": today - timedelta(days=1),
                "sample_on": timezone.now() - timedelta(days=1, hours=2),
                "ip_no": "IP-118",
                "doctor": doctors["DOC003"],
                "out_doctor_name": "",
                "hospital": hospitals["HSP003"],
                "corporate_name": "",
                "pay_mode": Visit.PayMode.UPI,
                "discount_mode": Visit.DiscountMode.NORMAL,
                "discount_percent": Decimal("0"),
                "discount_reason": "",
                "note": "Renal follow-up.",
                "round_off": Decimal("0"),
                "gross_amount": Decimal("0"),
                "net_amount": Decimal("0"),
                "received_amount": Decimal("0"),
                "balance_amount": Decimal("0"),
                "status": Visit.Status.RESULT_ENTERED,
            },
            {
                "lab_no": "NCL-38820",
                "patient": patients["PAT005"],
                "visit_date": today,
                "sample_on": timezone.now() - timedelta(hours=3),
                "ip_no": "",
                "doctor": doctors["DOC001"],
                "out_doctor_name": "",
                "hospital": hospitals["HSP001"],
                "corporate_name": "",
                "pay_mode": Visit.PayMode.CREDIT,
                "discount_mode": Visit.DiscountMode.STAFF,
                "discount_percent": Decimal("15.00"),
                "discount_reason": "Staff family discount",
                "note": "Pediatric screening.",
                "round_off": Decimal("0"),
                "gross_amount": Decimal("0"),
                "net_amount": Decimal("0"),
                "received_amount": Decimal("0"),
                "balance_amount": Decimal("0"),
                "status": Visit.Status.REGISTERED,
            },
        ]
        records: dict[str, Visit] = {}
        for payload in visit_payload:
            lab_no = payload["lab_no"]
            records[lab_no], _ = Visit.objects.update_or_create(
                lab_no=lab_no,
                defaults=payload,
            )
        return records

    def _seed_visit_tests_and_results(self, visits: dict[str, Visit], tests: dict[str, Test]) -> None:
        visit_lines = {
            "NCL-38582": [
                VisitLine("T009", Decimal("0.00")),
                VisitLine("T010", Decimal("0.00")),
                VisitLine("T011", Decimal("0.00")),
                VisitLine("T012", Decimal("0.00")),
                VisitLine("T013", Decimal("0.00")),
                VisitLine("T014", Decimal("0.00")),
                VisitLine("T015", Decimal("0.00")),
                VisitLine("T016", Decimal("0.00")),
                VisitLine("T017", Decimal("0.00")),
                VisitLine("T018", Decimal("0.00")),
                VisitLine("T005", Decimal("0.00")),
                VisitLine("T019", Decimal("0.00")),
                VisitLine("T020", Decimal("0.00")),
            ],
            "NCL-38715": [
                VisitLine("T001", Decimal("33.33")),
                VisitLine("T002", Decimal("33.33")),
                VisitLine("T003", Decimal("10.71")),
                VisitLine("T004", Decimal("40.00")),
                VisitLine("T005", Decimal("41.67")),
                VisitLine("T006", Decimal("16.67")),
                VisitLine("T007", Decimal("15.79")),
                VisitLine("T008", Decimal("28.57")),
            ],
            "NCL-38801": [
                VisitLine("T001", Decimal("10.00")),
                VisitLine("T002", Decimal("10.00")),
                VisitLine("T006", Decimal("10.00")),
            ],
            "NCL-38812": [
                VisitLine("T005", Decimal("0.00")),
                VisitLine("T019", Decimal("0.00")),
                VisitLine("T020", Decimal("0.00")),
            ],
            "NCL-38820": [
                VisitLine("T003", Decimal("15.00")),
                VisitLine("T004", Decimal("15.00")),
            ],
        }

        result_values = {
            ("NCL-38582", "T009"): ("0.91", Decimal("0.91"), "", "mg/dL", "0.1 - 1.2 mg/dL"),
            ("NCL-38582", "T010"): ("0.19", Decimal("0.19"), "", "mg/dL", "upto 0.25"),
            ("NCL-38582", "T011"): ("0.7", Decimal("0.70"), "", "mg/dL", "0.2 - 0.6"),
            ("NCL-38582", "T012"): ("22", Decimal("22"), "", "U/L", "Females <40 U/L / Males <40 U/L"),
            ("NCL-38582", "T013"): ("27", Decimal("27"), "", "U/L", "Females <34 U/L / Males <45 U/L"),
            ("NCL-38582", "T014"): ("74", Decimal("74"), "", "IU/L", "Men <128 U/L / Women <141 U/L"),
            ("NCL-38582", "T015"): ("8.0", Decimal("8.0"), "", "gm/dL", "6.6 - 8.8 gm/dL"),
            ("NCL-38582", "T016"): ("4.4", Decimal("4.4"), "", "gm/dL", "3.5 - 5.2"),
            ("NCL-38582", "T017"): ("3.6", Decimal("3.6"), "", "gm/dL", "1.8 - 3.4"),
            ("NCL-38582", "T018"): ("1.2:1", None, "", "", "2:1"),
            ("NCL-38582", "T005"): ("4.3", Decimal("4.3"), "", "mg/dL", "Male: 3.6 - 7.2"),
            ("NCL-38582", "T019"): ("26", Decimal("26"), "", "mg/dL", "15 - 50"),
            ("NCL-38582", "T020"): ("0.97", Decimal("0.97"), "", "mg/dL", "Males 0.9 - 1.3 mg/dL"),
            ("NCL-38715", "T001"): ("92", Decimal("92"), "", "mg/dL", "70 - 100 mg/dL"),
            ("NCL-38715", "T002"): ("118", Decimal("118"), "", "mg/dL", "90 - 140 mg/dL"),
            ("NCL-38715", "T005"): ("5.8", Decimal("5.8"), "", "mg/dL", "Female: 2.5 - 6.5"),
            ("NCL-38812", "T005"): ("6.9", Decimal("6.9"), "", "mg/dL", "Male: 3.6 - 7.2"),
            ("NCL-38812", "T019"): ("48", Decimal("48"), "", "mg/dL", "15 - 50"),
            ("NCL-38812", "T020"): ("1.21", Decimal("1.21"), "", "mg/dL", "Males 0.9 - 1.3 mg/dL"),
        }

        for lab_no, lines in visit_lines.items():
            visit = visits[lab_no]
            total = Decimal("0")
            for line_order, line in enumerate(lines, start=1):
                test = tests[line.test_code]
                rate = test.rate
                amount = rate - ((rate * line.discount_percent) / Decimal("100"))
                visit_test, _ = VisitTest.objects.update_or_create(
                    visit=visit,
                    line_order=line_order,
                    defaults={
                        "test": test,
                        "test_name_snapshot": test.test_name,
                        "rate": rate,
                        "discount_percent": line.discount_percent,
                        "amount": amount,
                    },
                )
                total += amount

                result_key = (lab_no, line.test_code)
                if result_key in result_values:
                    value, numeric, text, unit, ref_text = result_values[result_key]
                    status = (
                        TestResult.Status.AUTHORIZED
                        if visit.status == Visit.Status.AUTHORIZED
                        else TestResult.Status.ENTERED
                    )
                    TestResult.objects.update_or_create(
                        visit=visit,
                        visit_test=visit_test,
                        test=test,
                        defaults={
                            "result_value": value,
                            "result_value_numeric": numeric,
                            "result_text": text,
                            "unit": unit or test.unit,
                            "reference_range_text": ref_text,
                            "remarks": "",
                            "status": status,
                            "entered_at": visit.sample_on + timedelta(hours=2),
                            "authorized_at": (
                                visit.sample_on + timedelta(hours=4)
                                if visit.status == Visit.Status.AUTHORIZED
                                else None
                            ),
                        },
                    )

            visit.gross_amount = total
            visit.net_amount = total + visit.round_off
            if visit.pay_mode == Visit.PayMode.CREDIT:
                visit.received_amount = Decimal("0")
                visit.balance_amount = visit.net_amount
            else:
                visit.received_amount = visit.net_amount
                visit.balance_amount = Decimal("0")
            visit.save(
                update_fields=[
                    "gross_amount",
                    "net_amount",
                    "received_amount",
                    "balance_amount",
                    "updated_at",
                ]
            )

    def _local_dt(self, year: int, month: int, day: int, hour: int, minute: int) -> datetime:
        naive = datetime.combine(date(year, month, day), time(hour, minute))
        return timezone.make_aware(naive, timezone.get_current_timezone())
