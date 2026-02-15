# core/ws/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

class StationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        qs = self.scope.get("query_string", b"").decode()
        # parse station_id if supplied in query_string
        station_id = None
        try:
            from urllib.parse import parse_qs
            qs_map = parse_qs(qs)
            station_id = qs_map.get("station_id", [None])[0]
        except Exception:
            station_id = None

        # decide group
        if station_id:
            self.group_name = f"station_{station_id}"
        else:
            self.group_name = "stations"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send(json.dumps({"event": "connected", "group": self.group_name}))

    async def disconnect(self, close_code):
        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            pass

    # called when group_send sends {"type": "station.event", "payload": {...}} or "station_event"
    async def station_event(self, event):
        payload = event.get("payload") or event.get("data") or event
        # pass directly to client
        await self.send(json.dumps(payload))

    # fallback in case tasks call 'station_event' without dot
    async def station_event_dot(self, event):
        await self.station_event(event)
