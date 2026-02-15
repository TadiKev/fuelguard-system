# core/api/permissions.py
from rest_framework.permissions import BasePermission

class IsAdminOrOwner(BasePermission):
    """
    Object-level permission that allows access only to admin users or the owner of an object.

    This permission is intentionally flexible and will work with objects that expose:
      - a `.user` attribute (Profile, many user-linked models)
      - an `.owner` or `.created_by` attribute
      - an integer/UUID foreign-key id that matches request.user.id

    Admins (is_staff or is_superuser) always pass.
    """

    def has_permission(self, request, view):
        # Allow safe methods for everyone, other methods require authentication.
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Admin users are allowed
        if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
            return True

        # If object is a Profile-like object with `.user`
        if hasattr(obj, "user"):
            try:
                # direct compare (handles FK -> user instance)
                if obj.user == user:
                    return True
            except Exception:
                pass
            # handle case where `obj.user` is an id/pk
            if str(getattr(obj, "user", "")) == str(getattr(user, "id", "")):
                return True

        # Common alternate owner attributes
        for attr in ("owner", "created_by"):
            if hasattr(obj, attr):
                val = getattr(obj, attr)
                if val == user:
                    return True
                if str(val) == str(getattr(user, "id", "")):
                    return True
                # if val is a related user instance
                if hasattr(val, "id") and str(getattr(val, "id", "")) == str(getattr(user, "id", "")):
                    return True

        # fallback: if object itself is a user
        if obj == user:
            return True

        return False
