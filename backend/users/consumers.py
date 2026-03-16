import asyncio
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model

from .services import async_user_online_service

logger = logging.getLogger(__name__)

# Server-side heartbeat interval (seconds)
HEARTBEAT_INTERVAL = 30
# How long to wait for a pong before considering connection dead
HEARTBEAT_TIMEOUT = 10


class UserOnlineStatusMixin(AsyncJsonWebsocketConsumer):
    """Mixin for automatic WebSocket user online status tracking."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.connection_id = None
        self.user_id = None
        self._heartbeat_task = None
        self._pong_received = asyncio.Event()

    async def connect(self):
        """Handle WebSocket connection and track user online status."""
        user = self.scope.get("user")

        if not user or not user.is_authenticated:
            logger.error("WebSocket connection attempted without authenticated user")
            await self.close(code=4001)
            return

        self.user_id = user.id
        self.connection_id = async_user_online_service.generate_connection_id()

        try:
            connection_count = await async_user_online_service.add_user_connection(
                self.user_id, self.connection_id
            )
            logger.info(
                f"User {self.user_id} connected (ID: {self.connection_id}, Total: {connection_count})"
            )
            await self.accept()
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            await self._on_status_changed(True, connection_count)
        except Exception as e:
            logger.error(f"Error tracking user {self.user_id} connection: {e}")
            await self.close(code=4000)

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection and update user online status."""
        logger.info(
            f"UserOnlineStatusMixin.disconnect called for user {self.user_id} "
            f"(connection {self.connection_id}, close_code={close_code})"
        )
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

        if self.user_id and self.connection_id:
            try:
                remaining = await async_user_online_service.remove_user_connection(
                    self.user_id, self.connection_id
                )
                logger.info(
                    f"User {self.user_id} disconnected (ID: {self.connection_id}, Remaining: {remaining})"
                )
                if remaining == 0:
                    await self._on_status_changed(False, remaining)
                else:
                    logger.info(
                        f"User {self.user_id} still has {remaining} connections, not broadcasting offline"
                    )
            except Exception as e:
                logger.error(f"Error removing user {self.user_id} connection: {e}")
        else:
            logger.warning(
                f"disconnect called but user_id={self.user_id}, connection_id={self.connection_id}"
            )

        await super().disconnect(close_code)

    async def _heartbeat_loop(self):
        """Server-side heartbeat: periodically ping the client and close if no pong."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                self._pong_received.clear()
                try:
                    await self.send_json({"type": "ping"})
                except Exception:
                    break
                try:
                    await asyncio.wait_for(
                        self._pong_received.wait(), timeout=HEARTBEAT_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        f"User {self.user_id} heartbeat timeout (connection {self.connection_id})"
                    )
                    await self.close(code=4002)
                    break
        except asyncio.CancelledError:
            pass

    async def _on_status_changed(self, is_online, connection_count):
        """Notify all connected clients about online status changes."""
        logger.info(
            f"Broadcasting status change: user {self.user_id} is_online={is_online} "
            f"(connections={connection_count})"
        )
        try:
            await self.channel_layer.group_send(
                "broadcast",
                {
                    "type": "user",
                    "user_id": self.user_id,
                    "data": {
                        "is_online": is_online,
                    },
                },
            )
            logger.info(f"Broadcast sent successfully for user {self.user_id}")
        except Exception as e:
            logger.error(f"Failed to broadcast status for user {self.user_id}: {e}")


class WebsocketConsumer(UserOnlineStatusMixin, AsyncJsonWebsocketConsumer):
    """WebSocket consumer for user communications and online status tracking."""

    async def connect(self):
        """Connect: join groups first, then register online status and broadcast."""
        # Authenticate user before joining groups
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        # Join groups BEFORE super().connect() so we receive our own status broadcast
        # and don't miss any messages sent between accept() and group_add
        await self.channel_layer.group_add(f"user_{user.id}", self.channel_name)
        await self.channel_layer.group_add("broadcast", self.channel_name)

        await super().connect()

    async def disconnect(self, close_code):
        """Disconnect: remove own channel from broadcast first, then broadcast offline."""
        # Leave broadcast group BEFORE broadcasting so we don't send to our own
        # dying channel (which can silently swallow the group_send on Redis layer)
        await self.channel_layer.group_discard("broadcast", self.channel_name)

        # Broadcast offline status and clean up connection tracking
        await super().disconnect(close_code)

        # Leave user-specific group last
        if self.user_id:
            await self.channel_layer.group_discard(
                f"user_{self.user_id}", self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        """Handle incoming WebSocket messages."""
        msg_type = content.get("type")
        data = content.get("data", {})

        # Handle pong responses for server-side heartbeat
        if msg_type == "pong":
            self._pong_received.set()
            return

        handlers = {
            "ping": self._handle_ping,
            "get_status": self._handle_get_status,
            "send_message": self._handle_send_message,
            "broadcast": self._handle_broadcast,
        }

        handler = handlers.get(msg_type)
        if handler:
            await handler(content, data)
        else:
            await self._send_error(f"Unknown message type: {msg_type}")

    # Message handlers
    async def _handle_ping(self, content, _data):
        await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})

    async def _handle_get_status(self, _content, _data):
        connection_count = await async_user_online_service.get_user_connection_count(
            self.user_id
        )
        is_online = await async_user_online_service.is_user_online(self.user_id)

        await self.send_json(
            {
                "type": "status_response",
                "data": {
                    "user_id": self.user_id,
                    "is_online": is_online,
                    "connection_count": connection_count,
                    "connection_id": self.connection_id,
                },
            }
        )

    async def _handle_send_message(self, content, data):
        target_user_id = data.get("target_user_id")
        message = data.get("message")

        if not target_user_id or not message:
            await self._send_error("target_user_id and message are required")
            return

        try:
            User = get_user_model()
            sender = await User.objects.aget(id=self.user_id)

            await self.channel_layer.group_send(
                f"user_{target_user_id}",
                {
                    "type": "user_message",
                    "data": {
                        "message_type": data.get("message_type", "user_message"),
                        "from_user_id": self.user_id,
                        "message": message,
                        "timestamp": content.get("timestamp"),
                    },
                },
            )

            await self.send_json(
                {
                    "type": "message_sent",
                    "data": {"target_user_id": target_user_id, "message": message},
                }
            )
        except Exception as e:
            await self._send_error(f"Failed to send message: {str(e)}")

    async def _handle_broadcast(self, content, data):
        try:
            User = get_user_model()
            user = await User.objects.aget(id=self.user_id)

            if not (user.is_staff or user.is_superuser):
                await self._send_error("Permission denied: Admin privileges required")
                return
        except Exception:
            await self._send_error("User not found")
            return

        message = data.get("message")
        if not message:
            await self._send_error("message is required")
            return

        await self.channel_layer.group_send(
            "broadcast",
            {
                "type": "broadcast",
                "data": {
                    "message_type": data.get("message_type", "system_broadcast"),
                    "from_user_id": self.user_id,
                    "message": message,
                    "timestamp": content.get("timestamp"),
                },
            },
        )

        await self.send_json({"type": "broadcast_sent", "data": {"message": message}})

    # Channel layer event handlers
    async def consultation(self, event):
        await self.send_json(
            {
                "event": "consultation",
                "consultation_id": event["consultation_id"],
                "state": event["state"],
            }
        )

    async def message(self, event):
        await self.send_json(
            {
                "event": "message",
                "consultation_id": event["consultation_id"],
                "message_id": event["message_id"],
                "state": event["state"],
                "data": event["data"],
            }
        )

    async def notification(self, event):
        await self.send_json(
            {
                "event": "notification",
                "render_content_html": event["render_content_html"],
                "access_link": event["access_link"],
                "render_subject": event["render_subject"],
                "action_label": event["action_label"],
                "action": event["action"],
                "created_at": event["created_at"],
            }
        )

    async def appointment(self, event):
        response = {
            "event": "appointment",
            "consultation_id": event["consultation_id"],
            "appointment_id": event["appointment_id"],
            "state": event["state"],
        }
        if "data" in event:
            response["data"] = event["data"]
        await self.send_json(response)

    async def user(self, event):
        logger.info(
            f"Sending user event to channel {self.channel_name}: "
            f"user_id={event['user_id']} is_online={event['data'].get('is_online')}"
        )
        await self.send_json(
            {
                "event": "user",
                "user_id": event["user_id"],
                "data": event["data"],
            }
        )

    async def call_request(self, event):
        await self.send_json(
            {
                "event": "call_request",
                "consultation_id": event["consultation_id"],
                "caller_id": event["caller_id"],
                "caller_name": event["caller_name"],
            }
        )

    async def call_response(self, event):
        await self.send_json(
            {
                "event": "call_response",
                "consultation_id": event["consultation_id"],
                "accepted": event["accepted"],
                "responder_id": event["responder_id"],
                "responder_name": event["responder_name"],
            }
        )

    # Utility methods
    async def _send_error(self, message):
        await self.send_json({"type": "error", "message": message})
