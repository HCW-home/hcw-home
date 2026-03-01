# middleware.py
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_user(validated_token):
    return JWTAuthentication().get_user(validated_token)


class CorsMiddleware(BaseMiddleware):
    """
    CORS middleware for Django Channels WebSocket connections
    """

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            # Only allow all origins in DEBUG mode
            scope["cors_allowed"] = settings.DEBUG

        return await super().__call__(scope, receive, send)


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope["query_string"].decode())
        token = query_string.get("token", [None])[0]

        try:
            validated_token = JWTAuthentication().get_validated_token(token)
            scope["user"] = await get_user(validated_token)
        except (InvalidToken, TokenError):
            logger.warning("WebSocket connection rejected: invalid or expired token")
            # Accept then immediately close with 4401 so the client knows to refresh
            await send({"type": "websocket.close", "code": 4401})
            return

        return await super().__call__(scope, receive, send)
