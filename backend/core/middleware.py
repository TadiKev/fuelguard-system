# core/ws/middleware.py
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.backends import TokenBackend
from django.conf import settings

logger = logging.getLogger("fuelguard.ws.middleware")

User = get_user_model()

@database_sync_to_async
def get_user_from_token(token):
    try:
        # Use TokenBackend to decode & verify
        backend = TokenBackend(
            algorithm=getattr(settings, "SIMPLE_JWT", {}).get("ALGORITHM", "HS256"),
            signing_key=getattr(settings, "SECRET_KEY"),
        )
        validated = backend.decode(token, verify=True)
        user_id = validated.get("user_id") or validated.get("user_id")
        if not user_id:
            return AnonymousUser()
        return User.objects.get(id=user_id)
    except Exception as exc:
        logger.debug("token -> user failed: %s", exc)
        return AnonymousUser()

class TokenAuthMiddleware:
    """
    ASGI middleware that looks for ?token=... or Authorization header and sets scope['user'].
    """

    def __init__(self, inner):
        self.inner = inner

    def __call__(self, scope):
        return TokenAuthMiddlewareInstance(scope, self)

class TokenAuthMiddlewareInstance:
    def __init__(self, scope, middleware):
        self.scope = dict(scope)
        self.inner = middleware.inner

    async def __call__(self, receive, send):
        scope = self.scope
        headers = {k.decode(): v.decode() for k, v in scope.get("headers", [])}
        token = None

        # Authorization header if present
        auth = headers.get("authorization") or headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

        # Query string fallback
        if not token:
            query_string = scope.get("query_string", b"").decode()
            qs = parse_qs(query_string)
            token_list = qs.get("token") or qs.get("access_token")
            if token_list:
                token = token_list[0]

        if token:
            user = await get_user_from_token(token)
            scope["user"] = user
        else:
            scope["user"] = AnonymousUser()

        inner = self.inner(scope)
        return await inner(receive, send)

# helper stack for ease of use
def TokenAuthMiddlewareStack(inner):
    return TokenAuthMiddleware(inner)
