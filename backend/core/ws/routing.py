# core/ws/routing.py
from django.urls import re_path
from .consumers import StationsConsumer

websocket_urlpatterns = [
    re_path(r"^ws/stations/?$", StationsConsumer.as_asgi()),
]
