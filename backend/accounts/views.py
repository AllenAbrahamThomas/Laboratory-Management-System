from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LoginSession
from .serializers import LoginSessionSerializer


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = LoginSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        return Response(LoginSessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def recent_logins(request):
    sessions = LoginSession.objects.all()[:20]
    return Response(LoginSessionSerializer(sessions, many=True).data)
