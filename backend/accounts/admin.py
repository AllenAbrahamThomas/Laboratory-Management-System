from django.contrib import admin

from .models import LoginSession


@admin.register(LoginSession)
class LoginSessionAdmin(admin.ModelAdmin):
    list_display = ("username", "user_group", "login_at")
    list_filter = ("user_group", "login_at")
    search_fields = ("username", "user_group")
