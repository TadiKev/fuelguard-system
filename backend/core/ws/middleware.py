# core/ws/middleware.py
import urllib.parse
import jwt
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from channels.auth import AuthMiddlewareStack

class TokenAuthMiddleware:
    """
    ASGI middleware that extracts a JWT token from the WebSocket query string
    ( ?token=... ) or Authorization header and injects `scope['user']`.
    Importantly — do NOT import Django ORM models at module import time.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        # decode query string
        query_string = scope.get("query_string", b"").decode()
        qs = urllib.parse.parse_qs(query_string)
        token = None
        if "token" in qs:
            token = qs["token"][0]
        else:
            # fallback to headers if provided
            headers = dict((k.decode(), v.decode()) for k, v in scope.get("headers", []))
            auth = headers.get("authorization") or headers.get("Authorization")
            if auth and auth.lower().startswith("bearer "):
                token = auth.split(" ", 1)[1].strip()

        scope["user"] = AnonymousUser()

        if token:
            try:
                # decode token (HS256) using project SECRET_KEY
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"verify_aud": False})
                # import User model at runtime (apps ready by now)
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user_id = payload.get("user_id") or payload.get("user") or payload.get("sub")
                if user_id:
                    try:
                        user = await _get_user_async(User, user_id)
                    except Exception:
                        # fallback to sync lookup
                        try:
                            user = User.objects.filter(pk=user_id).first()
                        except Exception:
                            user = None
                    if user:
                        scope["user"] = user
            except Exception:
                # token decode failed -> leave AnonymousUser
                pass

        return await self.inner(scope, receive, send)


# helper to support async user lookup when DB async drivers available
async def _get_user_async(User, pk):
    # simple default: use sync lookup (most setups)
    return User.objects.filter(pk=pk).first()


def TokenAuthMiddlewareStack(inner):
    """
    Wrap the given inner application with AuthMiddlewareStack then TokenAuthMiddleware.
    Use in asgi.py as: TokenAuthMiddlewareStack(URLRouter(...))
    """
    return TokenAuthMiddleware(AuthMiddlewareStack(inner))
