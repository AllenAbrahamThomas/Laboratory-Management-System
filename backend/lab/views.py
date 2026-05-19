from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Visit
from .serializers import VisitDetailSerializer, VisitListSerializer


@api_view(["GET"])
def visit_list(request):
    queryset = Visit.objects.select_related("patient", "doctor").all()

    lab_no = request.query_params.get("lab_no", "").strip()
    patient = request.query_params.get("patient", "").strip()
    phone = request.query_params.get("phone", "").strip()
    address = request.query_params.get("address", "").strip()
    match_mode = request.query_params.get("match_mode", "contains").strip().lower()
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

    queryset = queryset.order_by("visit_date", "id")
    return Response(VisitListSerializer(queryset, many=True).data)


@api_view(["GET"])
def visit_detail(request, visit_id: int):
    visit = get_object_or_404(
        Visit.objects.select_related("patient", "doctor", "hospital").prefetch_related("visit_tests__test"),
        id=visit_id,
    )
    return Response(VisitDetailSerializer(visit).data)
