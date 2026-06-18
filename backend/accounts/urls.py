from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    LoginView,
    recent_logins,
    AccountHeadViewSet,
    CashTransactionViewSet,
    JournalEntryViewSet,
    daybook_view,
)


router = DefaultRouter()
router.register("heads", AccountHeadViewSet, basename="account-head")
router.register("transactions", CashTransactionViewSet, basename="cash-transaction")
router.register("journals", JournalEntryViewSet, basename="journal")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("login-sessions/", recent_logins, name="login-sessions"),
    path("daybook/", daybook_view, name="daybook"),
    path("", include(router.urls)),
]
