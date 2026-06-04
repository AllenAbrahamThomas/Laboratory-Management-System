from django.urls import path

from .views import (
    result_entry_by_lab_no,
    result_entry_by_visit,
    result_entry_save,
    test_lookup,
    next_visit_lab_no,
    visit_create,
    visit_detail,
    visit_detail_by_lab_no,
    visit_list,
    visit_update,
)


urlpatterns = [
    path("visits/", visit_list, name="visit-list"),
    path("visits/next-lab-no/", next_visit_lab_no, name="visit-next-lab-no"),
    path("visits/create/", visit_create, name="visit-create"),
    path("visits/<int:visit_id>/", visit_detail, name="visit-detail"),
    path("visits/lab/<str:lab_no>/", visit_detail_by_lab_no, name="visit-detail-by-lab"),
    path("visits/<int:visit_id>/update/", visit_update, name="visit-update"),
    path("tests/", test_lookup, name="test-lookup"),
    path("result-entry/visit/<int:visit_id>/", result_entry_by_visit, name="result-entry-by-visit"),
    path("result-entry/lab/<str:lab_no>/", result_entry_by_lab_no, name="result-entry-by-lab"),
    path("result-entry/visit/<int:visit_id>/save/", result_entry_save, name="result-entry-save"),
]
