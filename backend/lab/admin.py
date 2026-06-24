from django.contrib import admin
from .models import (
    Department,
    Doctor,
    Hospital,
    Patient,
    Test,
    TestComponent,
    TestGroupItem,
    Unit,
    TestReferenceRange,
    TestResult,
    Visit,
    VisitTest,
    ReagentItem,
    StockTransaction,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("department_code", "name", "report_order", "is_active")
    search_fields = ("department_code", "name")
    list_filter = ("is_active",)


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ("doctor_code", "name", "phone", "is_active")
    search_fields = ("doctor_code", "name", "phone")
    list_filter = ("is_active",)


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("hospital_code", "name", "phone", "is_active")
    search_fields = ("hospital_code", "name", "phone")
    list_filter = ("is_active",)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("patient_code", "full_name", "gender", "age_years", "age_months", "phone")
    search_fields = ("patient_code", "full_name", "phone")
    list_filter = ("gender",)


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)
    list_filter = ("is_active",)


class TestComponentInline(admin.TabularInline):
    model = TestComponent
    extra = 1
    fields = ("component_name", "result_type", "unit", "display_order", "is_active")

class TestReferenceRangeInline(admin.TabularInline):
    model = TestReferenceRange
    extra = 1
    fields = ("component", "reference_group", "operator", "min_value", "max_value", "display_text", "unit", "is_active")

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "component":
            resolved = request.resolver_match
            if resolved and resolved.kwargs.get("object_id"):
                test_id = resolved.kwargs["object_id"]
                kwargs["queryset"] = TestComponent.objects.filter(test_id=test_id)
            else:
                kwargs["queryset"] = TestComponent.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class ComponentReferenceRangeInline(admin.TabularInline):
    model = TestReferenceRange
    extra = 1
    fields = ("reference_group", "operator", "min_value", "max_value", "display_text", "unit", "is_active")


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = (
        "test_code",
        "test_name",
        "department",
        "rate",
        "reagent_item",
        "reagent_quantity",
        "reagent_auto_reduce",
        "is_active",
    )
    search_fields = ("test_code", "test_name", "short_name")
    list_filter = ("department", "result_type", "is_group", "is_active", "reagent_item", "reagent_auto_reduce")
    inlines = [TestComponentInline, TestReferenceRangeInline]


@admin.register(TestComponent)
class TestComponentAdmin(admin.ModelAdmin):
    list_display = ("test", "component_name", "result_type", "unit", "display_order", "is_active")
    search_fields = ("component_name", "test__test_name")
    list_filter = ("result_type", "is_active")
    inlines = [ComponentReferenceRangeInline]


@admin.register(TestGroupItem)
class TestGroupItemAdmin(admin.ModelAdmin):
    list_display = ("parent_test", "child_test", "line_order")
    list_filter = ("parent_test",)


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ("lab_no", "patient", "visit_date", "doctor", "hospital", "net_amount", "status")
    search_fields = ("lab_no", "patient__full_name", "patient__phone")
    list_filter = ("visit_date", "status", "pay_mode")


@admin.register(VisitTest)
class VisitTestAdmin(admin.ModelAdmin):
    list_display = ("visit", "test_name_snapshot", "rate", "discount_percent", "amount", "line_order")
    search_fields = ("visit__lab_no", "test_name_snapshot")


@admin.register(TestReferenceRange)
class TestReferenceRangeAdmin(admin.ModelAdmin):
    list_display = ("test", "component", "reference_group", "operator", "min_value", "max_value", "display_text", "is_active")
    list_filter = ("reference_group", "operator", "is_active")
    search_fields = ("test__test_name", "component__component_name", "display_text")


@admin.register(TestResult)
class TestResultAdmin(admin.ModelAdmin):
    list_display = ("visit", "test", "component", "result_value", "result_value_numeric", "status", "entered_at", "authorized_at")
    search_fields = ("visit__lab_no", "test__test_name", "component__component_name", "result_value", "result_text")
    list_filter = ("status",)


@admin.register(ReagentItem)
class ReagentItemAdmin(admin.ModelAdmin):
    list_display = ("name", "item_code", "reagent_type", "bottle_size", "unit_of_measure", "quantity_in_stock", "quantity_in_use")
    search_fields = ("name", "item_code")
    list_filter = ("reagent_type",)


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = ("reagent_item", "tx_type", "quantity", "bottle_size", "batch_no", "expiry_date", "received_date")
    list_filter = ("tx_type", "reagent_item", "received_date")
    search_fields = ("reagent_item__name", "batch_no")
