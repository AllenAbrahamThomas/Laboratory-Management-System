from rest_framework import serializers

from .models import LoginSession


class LoginSessionSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = LoginSession
        fields = ["id", "username", "user_group", "password", "login_at"]
        read_only_fields = ["id", "login_at"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("User name is required.")
        return value

    def validate(self, attrs):
        username = attrs.get("username", "").strip()
        password = attrs.get("password", "")

        if username != "admin" or password != "admin":
            raise serializers.ValidationError("Invalid username or password.")
        return attrs

    def create(self, validated_data):
        validated_data.pop("password", None)
        return LoginSession.objects.create(**validated_data)
