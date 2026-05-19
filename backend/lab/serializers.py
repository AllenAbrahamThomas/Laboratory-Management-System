from rest_framework import serializers

from .models import Visit, VisitTest


class VisitListSerializer(serializers.ModelSerializer):
    patient = serializers.CharField(source="patient.full_name", read_only=True)
    gender = serializers.CharField(source="patient.get_gender_display", read_only=True)
    age_years = serializers.IntegerField(source="patient.age_years", read_only=True)
    age_months = serializers.IntegerField(source="patient.age_months", read_only=True)
    address = serializers.CharField(source="patient.address", read_only=True)
    phone = serializers.CharField(source="patient.phone", read_only=True)
    doctor = serializers.SerializerMethodField()
    pay_status = serializers.SerializerMethodField()

    class Meta:
        model = Visit
        fields = [
            "id",
            "lab_no",
            "visit_date",
            "patient",
            "gender",
            "age_years",
            "age_months",
            "address",
            "phone",
            "doctor",
            "pay_status",
        ]

    def get_doctor(self, obj: Visit) -> str:
        if obj.doctor_id:
            return obj.doctor.name
        return obj.out_doctor_name

    def get_pay_status(self, obj: Visit) -> str:
        if obj.balance_amount and obj.balance_amount > 0:
            return "Pending"
        return "Paid"


class VisitTestDetailSerializer(serializers.ModelSerializer):
    test_code = serializers.CharField(source="test.test_code", read_only=True)
    test_name = serializers.CharField(source="test_name_snapshot", read_only=True)

    class Meta:
        model = VisitTest
        fields = [
            "id",
            "test_code",
            "test_name",
            "rate",
            "discount_percent",
            "amount",
            "line_order",
        ]


class VisitDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    gender = serializers.CharField(source="patient.get_gender_display", read_only=True)
    age_years = serializers.IntegerField(source="patient.age_years", read_only=True)
    age_months = serializers.IntegerField(source="patient.age_months", read_only=True)
    phone = serializers.CharField(source="patient.phone", read_only=True)
    address = serializers.CharField(source="patient.address", read_only=True)
    doctor = serializers.SerializerMethodField()
    hospital = serializers.CharField(source="hospital.name", read_only=True)
    tests = VisitTestDetailSerializer(source="visit_tests", many=True, read_only=True)

    class Meta:
        model = Visit
        fields = [
            "id",
            "lab_no",
            "visit_date",
            "sample_on",
            "patient_name",
            "gender",
            "age_years",
            "age_months",
            "phone",
            "address",
            "ip_no",
            "doctor",
            "out_doctor_name",
            "hospital",
            "corporate_name",
            "pay_mode",
            "discount_mode",
            "discount_percent",
            "discount_reason",
            "received_amount",
            "balance_amount",
            "gross_amount",
            "round_off",
            "note",
            "tests",
        ]

    def get_doctor(self, obj: Visit) -> str:
        if obj.doctor_id:
            return obj.doctor.name
        return obj.out_doctor_name
