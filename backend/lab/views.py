from datetime import datetime
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework import status
from rest_framework.response import Response

from .models import Patient, Visit
from .serializers import VisitDetailSerializer, VisitListSerializer


@api_view(["GET"])
def visit_list(request):
    queryset = Visit.objects.select_related("patient", "doctor").all()

    lab_no = request.query_params.get("lab_no", "").strip()
    patient = request.query_params.get("patient", "").strip()
    phone = request.query_params.get("phone", "").strip()
    address = request.query_params.get("address", "").strip()
    match_mode = request.query_params.get("match_mode", "contains").strip().lower()
    pending_only = request.query_params.get("pending_only", "").strip().lower()
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

    queryset = queryset.order_by("visit_date", "id")
    return Response(VisitListSerializer(queryset, many=True).data)


@api_view(["GET"])
def visit_detail(request, visit_id: int):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(VisitDetailSerializer(visit).data)


def _to_decimal(value, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value).strip())
    except Exception:
        return Decimal(default)


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


@api_view(["POST"])
def visit_create(request):
    data = request.data
    patient_name = str(data.get("patient_name", "")).strip()
    if not patient_name:
        return Response({"detail": "Patient name is required."}, status=status.HTTP_400_BAD_REQUEST)

    phone = str(data.get("phone", "")).strip()
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

    visit = Visit.objects.create(
        lab_no=str(data.get("lab_no", "")).strip(),
        patient=patient,
        visit_date=data.get("visit_date") or timezone.localdate(),
        sample_on=_parse_sample_on(str(data.get("sample_on", "")).strip()),
        ip_no=str(data.get("ip_no", "")).strip(),
        out_doctor_name=str(data.get("out_doctor_name", "")).strip(),
        corporate_name=str(data.get("corporate_name", "")).strip(),
        pay_mode=str(data.get("pay_mode", "cash")).strip().lower(),
        discount_mode=str(data.get("discount_mode", "normal")).strip().lower(),
        discount_percent=_to_decimal(data.get("discount_percent", "0")),
        discount_reason=str(data.get("discount_reason", "")).strip(),
        note=str(data.get("note", "")).strip(),
        round_off=_to_decimal(data.get("round_off", "0")),
        gross_amount=_to_decimal(data.get("gross_amount", "0")),
        net_amount=_to_decimal(data.get("gross_amount", "0")) + _to_decimal(data.get("round_off", "0")),
        received_amount=_to_decimal(data.get("received_amount", "0")),
        balance_amount=_to_decimal(data.get("balance_amount", "0")),
    )
    return Response(VisitDetailSerializer(visit).data, status=status.HTTP_201_CREATED)


@api_view(["PUT", "PATCH"])
def visit_update(request, visit_id: int):
    visit = get_object_or_404(Visit.objects.select_related("patient"), id=visit_id)
    data = request.data

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
    visit.discount_percent = _to_decimal(data.get("discount_percent", visit.discount_percent))
    visit.discount_reason = str(data.get("discount_reason", visit.discount_reason)).strip()
    visit.note = str(data.get("note", visit.note)).strip()
    visit.round_off = _to_decimal(data.get("round_off", visit.round_off))
    visit.gross_amount = _to_decimal(data.get("gross_amount", visit.gross_amount))
    visit.net_amount = visit.gross_amount + visit.round_off
    visit.received_amount = _to_decimal(data.get("received_amount", visit.received_amount))
    visit.balance_amount = _to_decimal(data.get("balance_amount", visit.balance_amount))
    visit.save()

    return Response(VisitDetailSerializer(visit).data)
