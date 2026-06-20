from rest_framework.views import exception_handler
from django.db.models.deletion import ProtectedError
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    # Call REST framework's default exception handler first to get standard response
    response = exception_handler(exc, context)

    # If it is an unhandled exception, check if it is a ProtectedError
    if response is None:
        if isinstance(exc, ProtectedError):
            # Extract names of referencing models for a friendly message if possible
            protected_relations = []
            for model in exc.protected_objects:
                model_name = getattr(model, '_meta', None) and model._meta.verbose_name
                if model_name and model_name not in protected_relations:
                    protected_relations.append(str(model_name))
            
            if protected_relations:
                detail_msg = f"Cannot delete this record because it is referenced by other items ({', '.join(protected_relations)})."
            else:
                detail_msg = "Cannot delete this record because it is referenced by other items in the database."
                
            return Response(
                {"detail": detail_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

    return response
