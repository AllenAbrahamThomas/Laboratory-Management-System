from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    result_entry_by_lab_no,
    result_entry_by_visit,
    result_entry_save,
    test_lookup,
    next_test_code_view,
    next_visit_lab_no,
    lab_print_config,
    upi_payment_config,
    visit_create,
    visit_detail,
    visit_detail_by_lab_no,
    visit_list,
    visit_update,
    visit_cancel_lookup,
    visit_cancel,
    visit_revoke_cancel,
    ReagentItemViewSet,
    StockTransactionViewSet,
    stock_report_view,
    DoctorViewSet,
    HospitalViewSet,
    PatientViewSet,
    DepartmentViewSet,
    UnitViewSet,
    TestDetailedViewSet,
    MethodViewSet,
    TechnologyViewSet,
    DiscountReasonViewSet,
    SMSTemplateViewSet,
    LabCustomizationViewSet,
    TestReferenceRangeViewSet,
    TestGroupItemViewSet,
)



router = DefaultRouter()
router.register("reagents", ReagentItemViewSet, basename="reagent")
router.register("doctors", DoctorViewSet, basename="doctor")
router.register("hospitals", HospitalViewSet, basename="hospital")
router.register("patients", PatientViewSet, basename="patient")
router.register("departments", DepartmentViewSet, basename="department")
router.register("units", UnitViewSet, basename="unit")
router.register("tests-detailed", TestDetailedViewSet, basename="test-detailed")
router.register("methods", MethodViewSet, basename="method")
router.register("technologies", TechnologyViewSet, basename="technology")
router.register("discount-reasons", DiscountReasonViewSet, basename="discount-reason")
router.register("sms-templates", SMSTemplateViewSet, basename="sms-template")
router.register("lab-customizations", LabCustomizationViewSet, basename="lab-customization")
router.register("test-reference-ranges", TestReferenceRangeViewSet, basename="test-reference-range")
router.register("test-group-items", TestGroupItemViewSet, basename="test-group-item")


urlpatterns = [
    path("visits/", visit_list, name="visit-list"),
    path("visits/next-lab-no/", next_visit_lab_no, name="visit-next-lab-no"),
    path("visits/create/", visit_create, name="visit-create"),
    path("visits/cancel-lookup/", visit_cancel_lookup, name="visit-cancel-lookup"),
    path("visits/<int:visit_id>/cancel/", visit_cancel, name="visit-cancel"),
    path("visits/<int:visit_id>/revoke-cancel/", visit_revoke_cancel, name="visit-revoke-cancel"),
    path("visits/<int:visit_id>/", visit_detail, name="visit-detail"),
    path("visits/lab/<str:lab_no>/", visit_detail_by_lab_no, name="visit-detail-by-lab"),
    path("visits/<int:visit_id>/update/", visit_update, name="visit-update"),

    path("tests/next-code/", next_test_code_view, name="test-next-code"),
    path("tests/", test_lookup, name="test-lookup"),
    path("print-config/", lab_print_config, name="lab-print-config"),
    path("payments/upi-config/", upi_payment_config, name="upi-payment-config"),
    path("result-entry/visit/<int:visit_id>/", result_entry_by_visit, name="result-entry-by-visit"),
    path("result-entry/lab/<str:lab_no>/", result_entry_by_lab_no, name="result-entry-by-lab"),
    path("result-entry/visit/<int:visit_id>/save/", result_entry_save, name="result-entry-save"),
    path("reagents/transactions/", StockTransactionViewSet.as_view({'get': 'list', 'post': 'create'}), name="reagent-transaction-list"),
    path("reagents/transactions/<int:pk>/", StockTransactionViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name="reagent-transaction-detail"),
    path("reagents/report/", stock_report_view, name="reagent-report"),
    path("", include(router.urls)),
]
