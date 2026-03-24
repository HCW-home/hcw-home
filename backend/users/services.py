import logging

from asgiref.sync import sync_to_async
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Cache timeout in seconds (40 seconds, refreshed on each heartbeat ping)
ONLINE_CACHE_TIMEOUT = 40
ONLINE_CACHE_PREFIX = "user_online:"


class UserOnlineStatusService:
    """
    Service for tracking user online status using Django cache.
    Stores a connection count per user. User is online when count > 0.
    """

    def _get_cache_key(self, user_id):
        return f"{ONLINE_CACHE_PREFIX}{user_id}"

    def add_connection(self, user_id):
        """Increment connection count. Returns new count."""
        key = self._get_cache_key(user_id)
        count = cache.get(key, 0)
        cache.set(key, count + 1, ONLINE_CACHE_TIMEOUT)
        return count + 1

    def remove_connection(self, user_id):
        """Decrement connection count. Returns remaining count."""
        key = self._get_cache_key(user_id)
        count = cache.get(key, 0)
        if count <= 1:
            cache.delete(key)
            return 0
        cache.set(key, count - 1, ONLINE_CACHE_TIMEOUT)
        return count - 1

    def is_user_online(self, user_id):
        """Check if user has active connections."""
        return cache.get(self._get_cache_key(user_id), 0) > 0

    def refresh_online(self, user_id):
        """Refresh the cache TTL (called on heartbeat ping)."""
        key = self._get_cache_key(user_id)
        count = cache.get(key, 0)
        if count > 0:
            cache.set(key, count, ONLINE_CACHE_TIMEOUT)


class AsyncUserOnlineStatusService:
    """Async wrapper for WebSocket consumers."""

    def __init__(self):
        self.sync_service = UserOnlineStatusService()

    @sync_to_async
    def add_connection(self, user_id):
        return self.sync_service.add_connection(user_id)

    @sync_to_async
    def remove_connection(self, user_id):
        return self.sync_service.remove_connection(user_id)

    @sync_to_async
    def is_user_online(self, user_id):
        return self.sync_service.is_user_online(user_id)

    @sync_to_async
    def refresh_online(self, user_id):
        return self.sync_service.refresh_online(user_id)


# Global instances
user_online_service = UserOnlineStatusService()
async_user_online_service = AsyncUserOnlineStatusService()
