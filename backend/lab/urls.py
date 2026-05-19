from django.urls import path

from .views import visit_create, visit_detail, visit_list, visit_update


urlpatterns = [
    path("visits/", visit_list, name="visit-list"),
    path("visits/create/", visit_create, name="visit-create"),
    path("visits/<int:visit_id>/", visit_detail, name="visit-detail"),
    path("visits/<int:visit_id>/update/", visit_update, name="visit-update"),
]
