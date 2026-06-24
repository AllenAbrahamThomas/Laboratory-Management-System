import re
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from accounts.authentication import SessionTokenAuthentication
from accounts.permissions import HasRequiredPermission, check_permission
from accounts.models import LabUser

from .models import Patient, Test, TestGroupItem, TestReferenceRange, TestResult, Visit, VisitTest, ReagentItem, StockTransaction, _next_test_code
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


def _normalize_lab_no(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    if cleaned.isdigit():
        normalized = cleaned.lstrip("0")
        return normalized or "0"

    return cleaned


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("invoice-entry")
def next_visit_lab_no(request):
    return Response({"lab_no": _next_lab_no()})


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def next_test_code_view(request):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        if "master-settings" not in user.permissions:
            raise PermissionDenied("You do not have permission to access master settings.")
    return Response({"test_code": _next_test_code()})


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_list(request):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        billing_perms = {"invoice-entry", "edit-invoice", "patient-advance-search", "pending-collection"}
        if not any(perm in user.permissions for perm in billing_perms):
            raise PermissionDenied("You do not have permission to view this list.")

    status_filter = request.query_params.get("status", "").strip().lower()
    queryset = Visit.objects.select_related("patient", "doctor").all()
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    else:
        queryset = queryset.exclude(status=Visit.Status.CANCELLED)


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
        normalized_lab_no = _normalize_lab_no(lab_no)
        if normalized_lab_no.isdigit():
            queryset = queryset.filter(
                Q(lab_no=normalized_lab_no.zfill(5))
                | Q(lab_no__regex=rf"^0*{re.escape(normalized_lab_no)}$")
            )
        else:
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

    if not lab_no:
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
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_detail(request, visit_id: int):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        billing_perms = {"invoice-entry", "edit-invoice"}
        if not any(perm in user.permissions for perm in billing_perms):
            raise PermissionDenied("You do not have permission to view visit details.")
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(VisitDetailSerializer(visit).data)


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_detail_by_lab_no(request, lab_no: str):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        billing_perms = {"invoice-entry", "edit-invoice"}
        if not any(perm in user.permissions for perm in billing_perms):
            raise PermissionDenied("You do not have permission to view visit details.")
    normalized_lab_no = _normalize_lab_no(lab_no)
    lookup = Q(lab_no=normalized_lab_no.zfill(5)) if normalized_lab_no.isdigit() else Q(lab_no=lab_no.strip())
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        lookup,
    )
    return Response(VisitDetailSerializer(visit).data)


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def test_lookup(request):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        allowed_perms = {"invoice-entry", "edit-invoice", "patient-advance-search", "result-entry"}
        if not any(perm in user.permissions for perm in allowed_perms):
            raise PermissionDenied("You do not have permission to look up tests.")
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


@api_view(["GET"])
def upi_payment_config(request):
    return Response({
        "upi_id": settings.PAYMENT_UPI_VPA,
        "payee_name": settings.PAYMENT_UPI_NAME,
        "currency": settings.PAYMENT_UPI_CURRENCY,
        "note": settings.PAYMENT_UPI_NOTE,
        "merchant_code": settings.PAYMENT_UPI_MCC,
        "is_configured": bool(settings.PAYMENT_UPI_VPA),
    })


@api_view(["GET"])
def lab_print_config(request):
    return Response({
        "lab_name": settings.LAB_NAME,
        "subtitle": settings.LAB_SUBTITLE,
        "address": settings.LAB_ADDRESS,
        "phone": settings.LAB_PHONE,
        "logo_url": settings.LAB_LOGO_URL,
    })


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
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("invoice-entry")
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
        visit.received_amount = visit.net_amount
        visit.balance_amount = Decimal("0")
        visit.save(update_fields=["gross_amount", "net_amount", "received_amount", "balance_amount", "updated_at"])

    return Response(VisitDetailSerializer(visit).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "PATCH"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("edit-invoice")
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
        visit.received_amount = visit.net_amount
        visit.balance_amount = Decimal("0")
        visit.save()

    return Response(VisitDetailSerializer(visit).data)


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_cancel_lookup(request):
    user = request.user
    if user.role not in [LabUser.Role.ADMIN, LabUser.Role.SUPERVISOR]:
        raise PermissionDenied("You do not have permission to access bill cancellation.")

    lab_no = request.query_params.get("lab_no", "").strip()
    if not lab_no:
        return Response({"detail": "Invoice number is required."}, status=status.HTTP_400_BAD_REQUEST)

    normalized_lab_no = _normalize_lab_no(lab_no)
    lookup = Q(lab_no=normalized_lab_no.zfill(5)) if normalized_lab_no.isdigit() else Q(lab_no=lab_no.strip())
    
    visit = Visit.objects.select_related("patient").filter(lookup).first()
    if not visit:
        return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "id": visit.id,
        "lab_no": visit.lab_no,
        "patient_name": visit.patient.full_name,
        "visit_date": visit.visit_date.isoformat(),
        "net_amount": str(visit.net_amount),
        "received_amount": str(visit.received_amount),
        "status": visit.status,
        "cancel_reason": visit.cancel_reason,
        "cancelled_by": visit.cancelled_by.username if visit.cancelled_by else None
    })


@api_view(["POST"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_cancel(request, visit_id: int):
    user = request.user
    if user.role not in [LabUser.Role.ADMIN, LabUser.Role.SUPERVISOR]:
        raise PermissionDenied("You do not have permission to cancel bills.")

    visit = get_object_or_404(Visit, id=visit_id)
    reason = request.data.get("reason", "").strip()
    if not reason:
        return Response({"detail": "Cancellation reason is required."}, status=status.HTTP_400_BAD_REQUEST)

    visit.status = Visit.Status.CANCELLED
    visit.cancel_reason = reason
    visit.cancelled_by = user
    visit.save(update_fields=["status", "cancel_reason", "cancelled_by", "updated_at"])

    return Response({"detail": "Invoice cancelled successfully."})


@api_view(["POST"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
def visit_revoke_cancel(request, visit_id: int):
    user = request.user
    if user.role != LabUser.Role.ADMIN:
        raise PermissionDenied("Only Administrators can revoke bill cancellation.")

    visit = get_object_or_404(Visit, id=visit_id)
    if visit.status != Visit.Status.CANCELLED:
        return Response({"detail": "This invoice is not cancelled."}, status=status.HTTP_400_BAD_REQUEST)

    has_results = TestResult.objects.filter(visit=visit, status=TestResult.Status.ENTERED).exists()
    visit.status = Visit.Status.RESULT_ENTERED if has_results else Visit.Status.REGISTERED
    visit.cancel_reason = ""
    visit.cancelled_by = None
    visit.save(update_fields=["status", "cancel_reason", "cancelled_by", "updated_at"])

    return Response({"detail": "Invoice cancellation revoked successfully."})



def _build_result_entry_payload(visit: Visit) -> dict:
    visit_tests = list(
        visit.visit_tests.select_related("test__department").order_by("line_order", "id")
    )
    patient = visit.patient
    gender_code = (patient.gender or "").lower()
    age_years = int(patient.age_years or 0)
    age_months = int(patient.age_months or 0)

    # Determine reference groups to check based on gender and age
    ref_groups = [TestReferenceRange.ReferenceGroup.COMMON]
    if age_years < 12:
        ref_groups.append(TestReferenceRange.ReferenceGroup.CHILD)
    if gender_code == "male":
        ref_groups.append(TestReferenceRange.ReferenceGroup.MALE)
    elif gender_code == "female":
        ref_groups.append(TestReferenceRange.ReferenceGroup.FEMALE)

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
                    reference_group__in=ref_groups
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
                "department_name": test.department.name,
                "department_order": test.department.report_order,
                "children": child_rows,
            })
        else:
            existing_result = TestResult.objects.filter(visit=visit, visit_test=vt, test=test).order_by("-id").first()
            reference = TestReferenceRange.objects.filter(test=test, is_active=True).filter(
                reference_group__in=ref_groups
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
                "department_name": test.department.name,
                "department_order": test.department.report_order,
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
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("result-entry")
def result_entry_by_visit(request, visit_id: int):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(_build_result_entry_payload(visit))


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("result-entry")
def result_entry_by_lab_no(request, lab_no: str):
    normalized_lab_no = _normalize_lab_no(lab_no)
    lookup = Q(lab_no=normalized_lab_no.zfill(5)) if normalized_lab_no.isdigit() else Q(lab_no=lab_no.strip())
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        lookup,
    )
    return Response(_build_result_entry_payload(visit))


@api_view(["POST"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("result-entry")
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

        # Reagent auto-reduction logic
        test_obj = tr.test
        if test_obj.reagent_item:
            reagent = test_obj.reagent_item
            if test_obj.reagent_auto_reduce or reagent.reagent_type == 'card':
                if result_value:
                    tx = StockTransaction.objects.filter(test_result=tr).first()
                    if not tx:
                        StockTransaction.objects.create(
                            reagent_item=reagent,
                            tx_type='outward',
                            quantity=test_obj.reagent_quantity or 1,
                            received_date=timezone.now().date(),
                            narration=f"Auto card consume: Lab No {visit.lab_no}, Test {test_obj.test_name}",
                            test_result=tr
                        )
                else:
                    StockTransaction.objects.filter(test_result=tr).delete()

    visit.status = Visit.Status.RESULT_ENTERED
    visit.save(update_fields=["status", "updated_at"])
    return Response({"detail": "Saved"})


from rest_framework import viewsets
from rest_framework.decorators import action
from .models import ReagentItem, StockTransaction
from .serializers import ReagentItemSerializer, StockTransactionSerializer
import datetime as dt


class ReagentItemViewSet(viewsets.ModelViewSet):
    queryset = ReagentItem.objects.all()
    serializer_class = ReagentItemSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]
    required_permission = "reagent-items"

    @action(detail=True, methods=['get'])
    def batches(self, request, pk=None):
        reagent = self.get_object()
        txs = StockTransaction.objects.filter(reagent_item=reagent)
        batches_map = {}
        for tx in txs:
            batch = tx.batch_no or ""
            if batch not in batches_map:
                batches_map[batch] = {
                    "batch_no": batch,
                    "expiry_date": tx.expiry_date.isoformat() if tx.expiry_date else None,
                    "bottle_size": float(tx.bottle_size) if tx.bottle_size else (float(reagent.bottle_size) if reagent.bottle_size else None),
                    "inward_qty": 0.0,
                    "outward_qty": 0.0
                }
            if tx.tx_type == 'inward':
                batches_map[batch]["inward_qty"] += float(tx.quantity)
                if tx.expiry_date:
                    batches_map[batch]["expiry_date"] = tx.expiry_date.isoformat()
            elif tx.tx_type == 'outward':
                batches_map[batch]["outward_qty"] += float(tx.quantity)
        
        active_batches = []
        for batch, data in batches_map.items():
            unopened_stock = data["inward_qty"] - data["outward_qty"]
            if unopened_stock > 0:
                data["unopened_stock"] = unopened_stock
                active_batches.append(data)
                
        return Response(active_batches)


class StockTransactionViewSet(viewsets.ModelViewSet):
    queryset = StockTransaction.objects.all()
    serializer_class = StockTransactionSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]

    def get_required_permission(self):
        if self.action == "create":
            tx_type = self.request.data.get("tx_type")
            if tx_type == "inward":
                return "stock-inward"
            elif tx_type == "outward":
                return "stock-outward"
        return "stock-inward"  # default fallback

    def check_permissions(self, request):
        self.required_permission = self.get_required_permission()
        super().check_permissions(request)

    def get_queryset(self):
        queryset = super().get_queryset()
        reagent_id = self.request.query_params.get('reagent')
        tx_type = self.request.query_params.get('tx_type')
        if reagent_id:
            queryset = queryset.filter(reagent_item_id=reagent_id)
        if tx_type:
            queryset = queryset.filter(tx_type=tx_type)
        return queryset


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("stock-report")
def stock_report_view(request):
    all_items = ReagentItem.objects.all()
    today_dt = dt.date.today()
    thirty_days_later = today_dt + dt.timedelta(days=30)

    low_stock = []
    expiring_soon = []
    expired = []

    for item in all_items:
        current_qty = item.quantity_in_stock
        if item.reagent_type == 'liquid' and item.bottle_size:
            current_qty = item.quantity_in_stock * item.bottle_size

        if current_qty <= item.min_stock_level:
            low_stock.append({
                "id": item.id,
                "name": item.name,
                "code": item.item_code,
                "quantity": float(current_qty),
                "min_level": float(item.min_stock_level),
                "unit": item.unit_of_measure,
                "reagent_type": item.reagent_type,
                "bottle_size": float(item.bottle_size) if item.bottle_size else None,
                "quantity_in_stock": float(item.quantity_in_stock),
                "quantity_in_use": float(item.quantity_in_use),
            })

    inward_txs = StockTransaction.objects.filter(tx_type='inward', expiry_date__isnull=False)
    for tx in inward_txs:
        if tx.expiry_date <= today_dt:
            expired.append({
                "id": tx.id,
                "reagent_name": tx.reagent_item.name,
                "batch_no": tx.batch_no,
                "expiry_date": tx.expiry_date.isoformat(),
                "quantity": float(tx.quantity),
                "supplier": tx.supplier_name
            })
        elif tx.expiry_date <= thirty_days_later:
            expiring_soon.append({
                "id": tx.id,
                "reagent_name": tx.reagent_item.name,
                "batch_no": tx.batch_no,
                "expiry_date": tx.expiry_date.isoformat(),
                "quantity": float(tx.quantity),
                "supplier": tx.supplier_name
            })

    return Response({
        "low_stock": low_stock,
        "expiring_soon": expiring_soon,
        "expired": expired,
        "total_items_tracked": all_items.count()
    })


from rest_framework import serializers
from .models import Doctor, Hospital, Department, Unit

class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = '__all__'

class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = '__all__'

class PatientSerializer(serializers.ModelSerializer):
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    class Meta:
        model = Patient
        fields = '__all__'

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'

class TestDetailedSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    technology_name = serializers.CharField(source='technology.name', read_only=True)
    reference_range_display = serializers.SerializerMethodField()
    reagent_quantity = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, allow_null=True)
    
    class Meta:
        model = Test
        fields = '__all__'
        
    def get_reference_range_display(self, obj):
        ranges = obj.reference_ranges.filter(is_active=True)
        return ", ".join([f"{r.get_gender_display()}: {r.display_text}" for r in ranges])



from rest_framework import permissions

class MasterSettingsPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_active:
            return False
        
        user = request.user
        if user.role == LabUser.Role.ADMIN:
            return True

        if "master-settings" not in user.permissions:
            return False

        if request.method == "DELETE":
            return user.role == LabUser.Role.SUPERVISOR

        return True


class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

class HospitalViewSet(viewsets.ModelViewSet):
    queryset = Hospital.objects.all()
    serializer_class = HospitalSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

class TestDetailedViewSet(viewsets.ModelViewSet):
    queryset = Test.objects.all()
    serializer_class = TestDetailedSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

    def perform_create(self, serializer):
        if not serializer.validated_data.get('test_code'):
            serializer.save(test_code=_next_test_code())
        else:
            serializer.save()

    def perform_update(self, serializer):
        original_instance = self.get_object()
        if 'test_code' in serializer.validated_data:
            serializer.validated_data['test_code'] = original_instance.test_code
        serializer.save()



from .models import TestReferenceRange, TestGroupItem, Method, Technology, DiscountReason, SMSTemplate, LabCustomization
from .serializers import (
    MethodSerializer,
    TechnologySerializer,
    DiscountReasonSerializer,
    SMSTemplateSerializer,
    LabCustomizationSerializer,
)

class TestReferenceRangeSerializer(serializers.ModelSerializer):
    gender = serializers.SerializerMethodField()
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)

    class Meta:
        model = TestReferenceRange
        fields = '__all__'

    def get_gender(self, obj) -> str:
        if obj.reference_group == TestReferenceRange.ReferenceGroup.COMMON:
            return "any"
        return obj.reference_group.lower()

    def to_internal_value(self, data):
        data = data.copy()
        if "gender" in data:
            gender_val = str(data["gender"]).strip().lower()
            if gender_val == "any":
                data["reference_group"] = TestReferenceRange.ReferenceGroup.COMMON
            elif gender_val == "male":
                data["reference_group"] = TestReferenceRange.ReferenceGroup.MALE
            elif gender_val == "female":
                data["reference_group"] = TestReferenceRange.ReferenceGroup.FEMALE
            elif gender_val == "child":
                data["reference_group"] = TestReferenceRange.ReferenceGroup.CHILD
            else:
                data["reference_group"] = TestReferenceRange.ReferenceGroup.COMMON
        return super().to_internal_value(data)


class TestGroupItemSerializer(serializers.ModelSerializer):
    child_test_name = serializers.CharField(source="child_test.test_name", read_only=True)
    child_test_code = serializers.CharField(source="child_test.test_code", read_only=True)
    
    class Meta:
        model = TestGroupItem
        fields = '__all__'


class TestReferenceRangeViewSet(viewsets.ModelViewSet):
    queryset = TestReferenceRange.objects.all()
    serializer_class = TestReferenceRangeSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        test_id = self.request.query_params.get("test")
        if test_id:
            queryset = queryset.filter(test_id=test_id)
        return queryset


class TestGroupItemViewSet(viewsets.ModelViewSet):
    queryset = TestGroupItem.objects.all()
    serializer_class = TestGroupItemSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        parent_test_id = self.request.query_params.get("parent_test")
        if parent_test_id:
            queryset = queryset.filter(parent_test_id=parent_test_id)
        return queryset


class MethodViewSet(viewsets.ModelViewSet):
    queryset = Method.objects.all()
    serializer_class = MethodSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]


class TechnologyViewSet(viewsets.ModelViewSet):
    queryset = Technology.objects.all()
    serializer_class = TechnologySerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]


class DiscountReasonViewSet(viewsets.ModelViewSet):
    queryset = DiscountReason.objects.all()
    serializer_class = DiscountReasonSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]


class SMSTemplateViewSet(viewsets.ModelViewSet):
    queryset = SMSTemplate.objects.all()
    serializer_class = SMSTemplateSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, MasterSettingsPermission]


class LabCustomizationViewSet(viewsets.ModelViewSet):
    queryset = LabCustomization.objects.all()
    serializer_class = LabCustomizationSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.user.role != LabUser.Role.ADMIN:
            raise PermissionDenied("Only Administrators can modify system customizations.")


