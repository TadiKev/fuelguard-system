# core/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/stations/?$", consumers.StationsConsumer.as_asgi()),
]
