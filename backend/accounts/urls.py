from django.urls import path

from .views import LoginView, recent_logins


urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("login-sessions/", recent_logins, name="login-sessions"),
]
