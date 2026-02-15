# core/permissions.py
from rest_framework.permissions import BasePermission


class IsAdminOrOwner(BasePermission):
    """
    Allow access if user is:
      - authenticated AND staff (django is_staff)
      - OR has a Profile.role of 'admin' or 'station_owner'
    This is a coarse permission used across admin/owner endpoints.
    """
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        # staff overrides everything
        if getattr(user, "is_staff", False):
            return True
        # defensive: profile might be missing in some test fixtures
        profile = getattr(user, "profile", None)
        role = getattr(profile, "role", None) if profile is not None else None
        return role in ("admin", "station_owner")


class IsAttendantOrOwner(BasePermission):
    """
    Allow access if user is:
      - authenticated AND staff
      - OR has a Profile.role of 'attendant', 'station_owner' or 'admin'
    Used for endpoints like receipt generation where attendants and owners may act.
    """
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_staff", False):
            return True
        profile = getattr(user, "profile", None)
        role = getattr(profile, "role", None) if profile is not None else None
        return role in ("attendant", "station_owner", "admin")
