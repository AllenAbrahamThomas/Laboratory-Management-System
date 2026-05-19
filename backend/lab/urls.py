from django.urls import path

from .views import visit_detail, visit_list


urlpatterns = [
    path("visits/", visit_list, name="visit-list"),
    path("visits/<int:visit_id>/", visit_detail, name="visit-detail"),
]
