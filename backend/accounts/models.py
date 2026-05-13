from django.db import models


class LoginSession(models.Model):
    username = models.CharField(max_length=120)
    user_group = models.CharField(max_length=120, blank=True)
    login_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-login_at"]

    def __str__(self):
        return f"{self.username} at {self.login_at:%Y-%m-%d %H:%M:%S}"
