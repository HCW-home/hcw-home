import logging

from asgiref.sync import sync_to_async
from django.core.cache import cache
from django.db import connection

logger = logging.getLogger(__name__)

# Cache timeout in seconds (40 seconds, refreshed on each heartbeat ping)
ONLINE_CACHE_TIMEOUT = 40
ONLINE_CACHE_PREFIX = "user_online:"


class UserOnlineStatusService:
    """
    Service for tracking user online status using Django cache.
    Cache key exists = user is online. Expires naturally if no heartbeat.
    """

    def _get_cache_key(self, user_id):
        schema = connection.tenant.schema_name
        return f"{schema}:{ONLINE_CACHE_PREFIX}{user_id}"

    def set_user_online(self, user_id):
        cache.set(self._get_cache_key(user_id), True, ONLINE_CACHE_TIMEOUT)

    def set_user_offline(self, user_id):
        cache.delete(self._get_cache_key(user_id))

    def is_user_online(self, user_id):
        return cache.get(self._get_cache_key(user_id), False)

    def refresh_online(self, user_id):
        cache.set(self._get_cache_key(user_id), True, ONLINE_CACHE_TIMEOUT)


class AsyncUserOnlineStatusService:
    """Async wrapper for WebSocket consumers."""

    def __init__(self):
        self.sync_service = UserOnlineStatusService()

    @sync_to_async
    def set_user_online(self, user_id):
        return self.sync_service.set_user_online(user_id)

    @sync_to_async
    def set_user_offline(self, user_id):
        return self.sync_service.set_user_offline(user_id)

    @sync_to_async
    def is_user_online(self, user_id):
        return self.sync_service.is_user_online(user_id)

    @sync_to_async
    def refresh_online(self, user_id):
        return self.sync_service.refresh_online(user_id)


# Global instances
user_online_service = UserOnlineStatusService()
async_user_online_service = AsyncUserOnlineStatusService()
