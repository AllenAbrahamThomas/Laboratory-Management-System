from functools import wraps
from rest_framework.exceptions import PermissionDenied, NotAuthenticated
from rest_framework import permissions
from .models import LabUser


class HasRequiredPermission(permissions.BasePermission):
    """
    DRF Permission class for ViewSets.
    Checks view.required_permission against request.user.permissions.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_active:
            return False
        
        user = request.user
        # Admin has access to all actions
        if user.role == LabUser.Role.ADMIN:
            return True

        required_perm = getattr(view, 'required_permission', None)
        if not required_perm:
            # If no specific permission is required on the view, deny for safety
            return False

        return required_perm in user.permissions


def check_permission(required_perm):
    """
    Decorator for DRF function-based views.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user or not request.user.is_active:
                raise NotAuthenticated("User is not authenticated.")

            user = request.user
            # Admin has access to all actions
            if user.role == LabUser.Role.ADMIN:
                return view_func(request, *args, **kwargs)

            if required_perm not in user.permissions:
                raise PermissionDenied("You do not have permission to perform this action.")

            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator
