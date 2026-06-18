from django.apps import AppConfig
from django.db.models.signals import post_migrate


def seed_admin(sender, **kwargs):
    from django.contrib.auth.hashers import make_password
    from .models import LabUser
    try:
        if not LabUser.objects.filter(role='admin').exists():
            LabUser.objects.create(
                username='admin',
                password=make_password('admin'),
                role='admin',
                permissions=[]  # admin has all permissions implicitly
            )
            print("Seeded default admin user: admin/admin")
    except Exception:
        pass


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        post_migrate.connect(seed_admin, sender=self)

