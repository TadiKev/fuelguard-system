# core_project/asgi.py (relevant excerpt)
import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_project.settings")
django_asgi_app = get_asgi_application()

# import here after settings are configured
from core.ws.middleware import TokenAuthMiddlewareStack
import core.ws.routing as ws_routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": TokenAuthMiddlewareStack(
        URLRouter(ws_routing.websocket_urlpatterns)
    ),
})
