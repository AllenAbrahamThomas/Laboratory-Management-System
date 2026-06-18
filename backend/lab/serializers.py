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
            "gross_amount",
            "received_amount",
            "balance_amount",
            "created_at",
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
    test_id = serializers.IntegerField(source="test.id", read_only=True)
    test_code = serializers.CharField(source="test.test_code", read_only=True)
    test_name = serializers.CharField(source="test_name_snapshot", read_only=True)

    class Meta:
        model = VisitTest
        fields = [
            "id",
            "test_id",
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


from .models import ReagentItem, StockTransaction


class ReagentItemSerializer(serializers.ModelSerializer):
    reagent_type_display = serializers.CharField(source="get_reagent_type_display", read_only=True)

    class Meta:
        model = ReagentItem
        fields = [
            "id",
            "name",
            "item_code",
            "reagent_type",
            "reagent_type_display",
            "bottle_size",
            "unit_of_measure",
            "min_stock_level",
            "quantity_in_stock",
            "quantity_in_use",
            "active_open_bottles",
            "created_at",
            "updated_at"
        ]
        read_only_fields = ["id", "quantity_in_stock", "quantity_in_use", "active_open_bottles", "created_at", "updated_at"]


class StockTransactionSerializer(serializers.ModelSerializer):
    reagent_item_name = serializers.CharField(source="reagent_item.name", read_only=True)
    reagent_item_unit = serializers.CharField(source="reagent_item.unit_of_measure", read_only=True)

    class Meta:
        model = StockTransaction
        fields = [
            "id",
            "reagent_item",
            "reagent_item_name",
            "reagent_item_unit",
            "tx_type",
            "quantity",
            "bottle_size",
            "batch_no",
            "expiry_date",
            "received_date",
            "unit_price",
            "supplier_name",
            "invoice_no",
            "narration",
            "test_result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value
