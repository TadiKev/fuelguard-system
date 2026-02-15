# core/ws/consumers.py
from channels.generic.websocket import AsyncJsonWebsocketConsumer

class StationsConsumer(AsyncJsonWebsocketConsumer):
    """
    Simple consumer that accepts connections and forwards JSON messages to clients.
    You can extend this later to subscribe to station groups, broadcast events, etc.
    """

    async def connect(self):
        # Optionally check authentication:
        # if not self.scope.get("user") or self.scope["user"].is_anonymous:
        #     await self.close()
        await self.accept()

    async def receive_json(self, content, **kwargs):
        # just echo back or ignore
        # You can implement commands here (subscribe/unsubscribe etc)
        # Keep minimal for now.
        await self.send_json({"ok": True, "echo": content})

    async def disconnect(self, code):
        return
