import datetime
from django.utils import timezone
from rest_framework import authentication
from rest_framework import exceptions
from .models import LoginSession, LabUser


class SessionTokenAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "token":
            return None

        token = parts[1]
        session = LoginSession.objects.filter(token=token).first()
        if not session:
            raise exceptions.AuthenticationFailed("Invalid session token.")

        # Check inactivity timeout (4 hours)
        now = timezone.now()
        inactivity_limit = datetime.timedelta(hours=4)
        if now - session.last_activity > inactivity_limit:
            session.delete()
            raise exceptions.AuthenticationFailed("Session expired due to inactivity.")

        # Update last activity
        session.last_activity = now
        session.save(update_fields=["last_activity"])

        # Fetch the associated user
        user = LabUser.objects.filter(username=session.username, is_active=True).first()
        if not user:
            raise exceptions.AuthenticationFailed("User not found or inactive.")

        # Return (user, auth)
        return (user, session)
