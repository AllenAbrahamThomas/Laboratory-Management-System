from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework import status
from rest_framework.response import Response

from .models import Patient, Test, TestGroupItem, TestReferenceRange, TestResult, Visit, VisitTest
from .serializers import VisitDetailSerializer, VisitListSerializer


def _next_lab_no() -> str:
    max_numeric_lab_no = 0
    for lab_no in Visit.objects.values_list("lab_no", flat=True):
        value = str(lab_no).strip()
        if value.isdigit():
            max_numeric_lab_no = max(max_numeric_lab_no, int(value))

    candidate_number = max_numeric_lab_no + 1
    while Visit.objects.filter(lab_no=str(candidate_number).zfill(5)).exists():
        candidate_number += 1

    return str(candidate_number).zfill(5)


@api_view(["GET"])
def next_visit_lab_no(request):
    return Response({"lab_no": _next_lab_no()})


@api_view(["GET"])
def visit_list(request):
    queryset = Visit.objects.select_related("patient", "doctor").all()

    lab_no = request.query_params.get("lab_no", "").strip()
    patient = request.query_params.get("patient", "").strip()
    phone = request.query_params.get("phone", "").strip()
    address = request.query_params.get("address", "").strip()
    match_mode = request.query_params.get("match_mode", "contains").strip().lower()
    pending_only = request.query_params.get("pending_only", "").strip().lower()
    department = request.query_params.get("department", "").strip()
    split_by_department = request.query_params.get("split_by_department", "").strip().lower()
    from_date = request.query_params.get("from_date", "").strip()
    to_date = request.query_params.get("to_date", "").strip()

    if lab_no:
        queryset = queryset.filter(lab_no__icontains=lab_no)

    if patient:
        queryset = queryset.filter(patient__full_name__icontains=patient)

    if phone:
        if match_mode == "startswith":
            queryset = queryset.filter(patient__phone__istartswith=phone)
        else:
            queryset = queryset.filter(patient__phone__icontains=phone)

    if address:
        if match_mode == "startswith":
            queryset = queryset.filter(patient__address__istartswith=address)
        else:
            queryset = queryset.filter(patient__address__icontains=address)

    if from_date:
        queryset = queryset.filter(visit_date__gte=from_date)

    if to_date:
        queryset = queryset.filter(visit_date__lte=to_date)

    if pending_only in {"1", "true", "yes"}:
        queryset = queryset.filter(balance_amount__gt=0)

    if department and department.lower() != "all":
        queryset = queryset.filter(visit_tests__test__department__name__iexact=department).distinct()

    if split_by_department in {"1", "true", "yes"} and department and department.lower() != "all":
        queryset = queryset.prefetch_related("visit_tests__test")
        department_rows = []
        for visit in queryset.order_by("visit_date", "id"):
            dept_total = Decimal("0")
            for visit_test in visit.visit_tests.all():
                test_department = getattr(getattr(visit_test, "test", None), "department", None)
                if not test_department:
                    continue
                if str(test_department.name).strip().lower() != department.lower():
                    continue
                dept_total += Decimal(visit_test.amount or 0)

            if dept_total <= 0:
                continue

            gross_amount = Decimal(visit.gross_amount or 0)
            received_amount = Decimal(visit.received_amount or 0)
            ratio = (dept_total / gross_amount) if gross_amount > 0 else Decimal("0")
            dept_received = (received_amount * ratio).quantize(Decimal("0.01"))
            if dept_received > dept_total:
                dept_received = dept_total
            dept_balance = (dept_total - dept_received).quantize(Decimal("0.01"))

            department_rows.append({
                "id": visit.id,
                "lab_no": visit.lab_no,
                "visit_date": visit.visit_date,
                "patient": visit.patient.full_name,
                "gender": visit.patient.get_gender_display(),
                "age_years": visit.patient.age_years,
                "age_months": visit.patient.age_months,
                "address": visit.patient.address,
                "phone": visit.patient.phone,
                "doctor": visit.doctor.name if visit.doctor_id else visit.out_doctor_name,
                "pay_status": "Pending" if dept_balance > 0 else "Paid",
                "gross_amount": dept_total,
                "received_amount": dept_received,
                "balance_amount": dept_balance,
                "created_at": visit.created_at,
            })

        return Response(department_rows)

    queryset = queryset.order_by("visit_date", "id")
    return Response(VisitListSerializer(queryset, many=True).data)


@api_view(["GET"])
def visit_detail(request, visit_id: int):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(VisitDetailSerializer(visit).data)


@api_view(["GET"])
def visit_detail_by_lab_no(request, lab_no: str):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        lab_no=lab_no.strip(),
    )
    return Response(VisitDetailSerializer(visit).data)


@api_view(["GET"])
def test_lookup(request):
    query = request.query_params.get("q", "").strip()
    queryset = Test.objects.select_related("department").filter(is_active=True)
    if query:
        queryset = queryset.filter(Q(test_code__icontains=query) | Q(test_name__icontains=query) | Q(short_name__icontains=query))
    tests = queryset.order_by("test_code")[:20]
    rows = [{
        "id": test.id,
        "test_code": test.test_code,
        "test_name": test.test_name,
        "short_name": test.short_name,
        "rate": str(test.rate),
        "default_discount_percent": str(test.default_discount_percent),
        "default_amount": str(test.default_amount),
        "department": test.department.name if test.department_id else "",
    } for test in tests]
    return Response(rows)


def _to_decimal(value, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value).strip())
    except Exception:
        return Decimal(default)


def _round_whole(value) -> Decimal:
    amount = _to_decimal(value)
    if amount <= 0:
        return Decimal("0")
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _round_bill_amount(value) -> Decimal:
    amount = _to_decimal(value)
    if amount <= 0:
        return Decimal("0")
    return (amount / Decimal("10")).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * Decimal("10")


def _to_int(value, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return default


def _parse_sample_on(value: str):
    if not value:
        return timezone.now()

    parsed = None
    try:
        parsed = datetime.fromisoformat(value)
    except Exception:
        pass

    if parsed is None:
        try:
            parsed = datetime.strptime(value, "%d %b %Y %I:%M %p")
        except Exception:
            return timezone.now()

    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _save_visit_tests(visit: Visit, tests_data) -> None:
    visit.visit_tests.all().delete()

    for index, raw_test in enumerate(tests_data or [], start=1):
        test_id = _to_int(raw_test.get("test_id") or raw_test.get("testId") or 0)
        test_code = str(raw_test.get("test_code") or raw_test.get("testCode") or "").strip()
        test_name = str(raw_test.get("test_name") or raw_test.get("testName") or "").strip()
        test = Test.objects.filter(pk=test_id).first() if test_id else None
        if test is None and test_code:
            test = (
                Test.objects.filter(test_code__iexact=test_code).first()
                or Test.objects.filter(short_name__iexact=test_code).first()
                or (Test.objects.filter(test_name__iexact=test_name).first() if test_name else None)
            )
        if test is None:
            raise ValueError(f"Unknown test reference: {test_id or test_code}")

        VisitTest.objects.create(
            visit=visit,
            test=test,
            test_name_snapshot=test_name or test.test_name,
            rate=_to_decimal(raw_test.get("rate", test.rate)),
            discount_percent=_round_whole(raw_test.get("discount", raw_test.get("discount_percent", 0))),
            amount=_round_bill_amount(raw_test.get("amount", 0)),
            line_order=_to_int(raw_test.get("line_order", index)),
        )


@api_view(["POST"])
def visit_create(request):
    data = request.data
    patient_name = str(data.get("patient_name", "")).strip()
    if not patient_name:
        return Response({"detail": "Patient name is required."}, status=status.HTTP_400_BAD_REQUEST)

    phone = str(data.get("phone", "")).strip()
    tests_data = list(data.get("tests") or [])

    with transaction.atomic():
        patient, _created = Patient.objects.get_or_create(
            full_name=patient_name,
            phone=phone,
            defaults={
                "gender": str(data.get("gender", "male")).strip().lower() or "male",
                "age_years": _to_int(data.get("age_years", 0)),
                "age_months": _to_int(data.get("age_months", 0)),
                "address": str(data.get("address", "")).strip(),
            },
        )

        patient.gender = str(data.get("gender", patient.gender)).strip().lower() or patient.gender
        patient.age_years = _to_int(data.get("age_years", patient.age_years))
        patient.age_months = _to_int(data.get("age_months", patient.age_months))
        patient.phone = phone
        patient.address = str(data.get("address", patient.address)).strip()
        patient.save()

        try:
            visit = Visit.objects.create(
                lab_no=_next_lab_no(),
                patient=patient,
                visit_date=data.get("visit_date") or timezone.localdate(),
                sample_on=_parse_sample_on(str(data.get("sample_on", "")).strip()),
                ip_no=str(data.get("ip_no", "")).strip(),
                out_doctor_name=str(data.get("out_doctor_name", "")).strip(),
                corporate_name=str(data.get("corporate_name", "")).strip(),
                pay_mode=str(data.get("pay_mode", "cash")).strip().lower(),
                discount_mode=str(data.get("discount_mode", "normal")).strip().lower(),
                discount_percent=_round_whole(data.get("discount_percent", "0")),
                discount_reason=str(data.get("discount_reason", "")).strip(),
                note=str(data.get("note", "")).strip(),
                round_off=_to_decimal(data.get("round_off", "0")),
                gross_amount=Decimal("0"),
                net_amount=Decimal("0"),
                received_amount=_to_decimal(data.get("received_amount", "0")),
                balance_amount=Decimal("0"),
            )
        except IntegrityError:
            visit = Visit.objects.create(
                lab_no=_next_lab_no(),
                patient=patient,
                visit_date=data.get("visit_date") or timezone.localdate(),
                sample_on=_parse_sample_on(str(data.get("sample_on", "")).strip()),
                ip_no=str(data.get("ip_no", "")).strip(),
                out_doctor_name=str(data.get("out_doctor_name", "")).strip(),
                corporate_name=str(data.get("corporate_name", "")).strip(),
                pay_mode=str(data.get("pay_mode", "cash")).strip().lower(),
                discount_mode=str(data.get("discount_mode", "normal")).strip().lower(),
                discount_percent=_round_whole(data.get("discount_percent", "0")),
                discount_reason=str(data.get("discount_reason", "")).strip(),
                note=str(data.get("note", "")).strip(),
                round_off=_to_decimal(data.get("round_off", "0")),
                gross_amount=Decimal("0"),
                net_amount=Decimal("0"),
                received_amount=_to_decimal(data.get("received_amount", "0")),
                balance_amount=Decimal("0"),
            )

        try:
            _save_visit_tests(visit, tests_data)
        except ValueError as exc:
            transaction.set_rollback(True)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        visit.gross_amount = sum((Decimal(vt.amount or 0) for vt in visit.visit_tests.all()), Decimal("0"))
        visit.net_amount = visit.gross_amount + _to_decimal(data.get("round_off", "0"))
        visit.received_amount = _to_decimal(data.get("received_amount", "0"))
        visit.balance_amount = max(visit.net_amount - visit.received_amount, Decimal("0"))
        visit.save(update_fields=["gross_amount", "net_amount", "received_amount", "balance_amount", "updated_at"])

    return Response(VisitDetailSerializer(visit).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "PATCH"])
def visit_update(request, visit_id: int):
    visit = get_object_or_404(Visit.objects.select_related("patient"), id=visit_id)
    data = request.data
    tests_data = list(data.get("tests") or [])

    with transaction.atomic():
        patient = visit.patient
        patient.full_name = str(data.get("patient_name", patient.full_name)).strip() or patient.full_name
        patient.gender = str(data.get("gender", patient.gender)).strip().lower() or patient.gender
        patient.age_years = _to_int(data.get("age_years", patient.age_years))
        patient.age_months = _to_int(data.get("age_months", patient.age_months))
        patient.phone = str(data.get("phone", patient.phone)).strip()
        patient.address = str(data.get("address", patient.address)).strip()
        patient.save()

        visit.lab_no = str(data.get("lab_no", visit.lab_no)).strip() or visit.lab_no
        visit.sample_on = _parse_sample_on(str(data.get("sample_on", "")).strip()) if data.get("sample_on") else visit.sample_on
        visit.ip_no = str(data.get("ip_no", visit.ip_no)).strip()
        visit.out_doctor_name = str(data.get("out_doctor_name", visit.out_doctor_name)).strip()
        visit.corporate_name = str(data.get("corporate_name", visit.corporate_name)).strip()
        visit.pay_mode = str(data.get("pay_mode", visit.pay_mode)).strip().lower()
        visit.discount_mode = str(data.get("discount_mode", visit.discount_mode)).strip().lower()
        visit.discount_percent = _round_whole(data.get("discount_percent", visit.discount_percent))
        visit.discount_reason = str(data.get("discount_reason", visit.discount_reason)).strip()
        visit.note = str(data.get("note", visit.note)).strip()
        visit.round_off = _to_decimal(data.get("round_off", visit.round_off))
        visit.received_amount = _to_decimal(data.get("received_amount", visit.received_amount))

        try:
            _save_visit_tests(visit, tests_data)
        except ValueError as exc:
            transaction.set_rollback(True)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        visit.gross_amount = sum((Decimal(vt.amount or 0) for vt in visit.visit_tests.all()), Decimal("0"))
        visit.net_amount = visit.gross_amount + visit.round_off
        visit.balance_amount = max(visit.net_amount - visit.received_amount, Decimal("0"))
        visit.save()

    return Response(VisitDetailSerializer(visit).data)


def _build_result_entry_payload(visit: Visit) -> dict:
    visit_tests = list(
        visit.visit_tests.select_related("test").order_by("line_order", "id")
    )
    patient = visit.patient
    gender_code = (patient.gender or "").lower()
    age_years = int(patient.age_years or 0)
    age_months = int(patient.age_months or 0)

    tests = []
    for vt in visit_tests:
        test = vt.test
        if test.is_group:
            child_items = TestGroupItem.objects.filter(parent_test=test).select_related("child_test").order_by("line_order", "id")
            child_rows = []
            for item in child_items:
                child_test = item.child_test
                existing_result = TestResult.objects.filter(visit=visit, visit_test=vt, test=child_test).order_by("-id").first()
                reference = TestReferenceRange.objects.filter(test=child_test, is_active=True).filter(
                    gender__in=[gender_code, "any"]
                ).order_by("id").first()
                child_rows.append({
                    "test_id": child_test.id,
                    "test_name": child_test.test_name,
                    "unit": child_test.unit or "",
                    "reference_range": reference.display_text if reference and reference.display_text else "",
                    "result_value": existing_result.result_value if existing_result else "",
                    "note": existing_result.remarks if existing_result else "",
                })
            tests.append({
                "visit_test_id": vt.id,
                "test_id": test.id,
                "test_name": vt.test_name_snapshot or test.test_name,
                "type": "group",
                "children": child_rows,
            })
        else:
            existing_result = TestResult.objects.filter(visit=visit, visit_test=vt, test=test).order_by("-id").first()
            reference = TestReferenceRange.objects.filter(test=test, is_active=True).filter(
                gender__in=[gender_code, "any"]
            ).order_by("id").first()
            tests.append({
                "visit_test_id": vt.id,
                "test_id": test.id,
                "test_name": vt.test_name_snapshot or test.test_name,
                "type": "general",
                "unit": test.unit or "",
                "reference_range": reference.display_text if reference and reference.display_text else "",
                "result_value": existing_result.result_value if existing_result else "",
                "note": existing_result.remarks if existing_result else "",
            })

    return {
        "visit_id": visit.id,
        "lab_no": visit.lab_no,
        "date": str(visit.visit_date),
        "sample_on": visit.sample_on.isoformat() if visit.sample_on else "",
        "pay_mode": visit.pay_mode,
        "patient_name": patient.full_name,
        "gender": patient.get_gender_display(),
        "age_years": age_years,
        "age_months": age_months,
        "phone": patient.phone,
        "address": patient.address,
        "doctor": visit.doctor.name if visit.doctor_id else visit.out_doctor_name,
        "out_doctor_name": visit.out_doctor_name,
        "hospital": visit.hospital.name if visit.hospital_id else "",
        "gross_amount": str(visit.gross_amount or 0),
        "received_amount": str(visit.received_amount or 0),
        "balance_amount": str(visit.balance_amount or 0),
        "round_off": str(visit.round_off or 0),
        "pay_status": "Pending" if (visit.balance_amount or 0) > 0 else "Paid",
        "tests": tests,
    }


@api_view(["GET"])
def result_entry_by_visit(request, visit_id: int):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(_build_result_entry_payload(visit))


@api_view(["GET"])
def result_entry_by_lab_no(request, lab_no: str):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        lab_no=lab_no,
    )
    return Response(_build_result_entry_payload(visit))


@api_view(["POST"])
def result_entry_save(request, visit_id: int):
    visit = get_object_or_404(Visit, id=visit_id)
    entries = request.data.get("entries", [])
    if not isinstance(entries, list):
        return Response({"detail": "entries must be a list"}, status=status.HTTP_400_BAD_REQUEST)

    for entry in entries:
        visit_test_id = entry.get("visit_test_id")
        test_id = entry.get("test_id")
        result_value = str(entry.get("result_value", "")).strip()
        note = str(entry.get("note", "")).strip()

        if not visit_test_id or not test_id:
            continue

        vt = VisitTest.objects.filter(id=visit_test_id, visit=visit).first()
        if not vt:
            continue

        tr = TestResult.objects.filter(visit=visit, visit_test=vt, test_id=test_id).order_by("-id").first()
        if tr is None:
            tr = TestResult(visit=visit, visit_test=vt, test_id=test_id)

        tr.result_value = result_value
        tr.remarks = note
        tr.status = TestResult.Status.ENTERED if result_value else TestResult.Status.PENDING
        tr.entered_at = timezone.now() if result_value else None
        tr.save()

    visit.status = Visit.Status.RESULT_ENTERED
    visit.save(update_fields=["status", "updated_at"])
    return Response({"detail": "Saved"})

