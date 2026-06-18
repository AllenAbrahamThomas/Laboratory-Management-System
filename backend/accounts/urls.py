from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    LoginView,
    UserRoleLookupView,
    recent_logins,
    AccountHeadViewSet,
    CashTransactionViewSet,
    JournalEntryViewSet,
    daybook_view,
    LabUserViewSet,
)


router = DefaultRouter()
router.register("heads", AccountHeadViewSet, basename="account-head")
router.register("transactions", CashTransactionViewSet, basename="cash-transaction")
router.register("journals", JournalEntryViewSet, basename="journal")
router.register("users", LabUserViewSet, basename="user")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("users/role-lookup/", UserRoleLookupView.as_view(), name="user-role-lookup"),
    path("login-sessions/", recent_logins, name="login-sessions"),
    path("daybook/", daybook_view, name="daybook"),
    path("", include(router.urls)),
]


