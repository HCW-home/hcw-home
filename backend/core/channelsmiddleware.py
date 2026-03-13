# middleware.py
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from channels.exceptions import DenyConnection
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django_tenants.utils import get_tenant_model, get_tenant_domain_model
from django.db import connection

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_tenant_from_scope(scope):
    """Get tenant from websocket scope (using Host header)."""
    headers = dict(scope.get("headers", []))
    host = headers.get(b"host", b"").decode("utf-8").split(":")[0]

    try:
        tenant_model = get_tenant_model()
        domain_model = get_tenant_domain_model()

        # Get domain and tenant
        domain = domain_model.objects.select_related("tenant").get(domain=host)
        return domain.tenant
    except domain_model.DoesNotExist:
        # Fallback to public schema or raise error
        return None

@database_sync_to_async
def set_tenant_in_db(tenant):
    """Set tenant schema in database connection."""
    if tenant:
        connection.set_tenant(tenant)

@database_sync_to_async
def get_user(validated_token):
    return JWTAuthentication().get_user(validated_token)


class TenantMiddleware(BaseMiddleware):
    """Middleware to set the tenant schema for websocket connections."""

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            # Get tenant from scope
            tenant = await get_tenant_from_scope(scope)

            if tenant:
                # Set the tenant schema
                await set_tenant_in_db(tenant)
                scope["tenant"] = tenant
            else:
                # Log warning if no tenant found
                logger.warning(
                    f"No tenant found for host: {dict(scope.get('headers', [])).get(b'host', b'').decode('utf-8')}")

        return await super().__call__(scope, receive, send)

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
    """
    JWT authentication middleware for WebSocket with tenant validation.

    Validates:
    1. Token is valid
    2. Token contains tenant_id
    3. Token tenant_id matches the tenant resolved by TenantMiddleware

    Denies connection if validation fails.
    """

    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope["query_string"].decode())
        token = query_string.get("token", [None])[0]

        try:
            # Validate token
            validated_token = JWTAuthentication().get_validated_token(token)

            # Check tenant_id in token
            tenant_id = validated_token.get('tenant_id')
            if tenant_id is None:
                logger.warning("WebSocket token missing tenant_id")
                raise DenyConnection("Invalid token format")

            # Get tenant from scope (set by TenantMiddleware)
            current_tenant = scope.get('tenant')
            if current_tenant is None:
                logger.warning("WebSocket connection without tenant context")
                raise DenyConnection("No tenant context")

            # Compare tenant_id
            if tenant_id != current_tenant.id:
                logger.warning(
                    f"WebSocket tenant mismatch: token={tenant_id}, current={current_tenant.id}"
                )
                raise DenyConnection("Tenant mismatch")

            # Get user
            scope["user"] = await get_user(validated_token)

        except DenyConnection:
            # Re-raise connection denial
            raise
        except Exception as e:
            logger.error(f"JWT authentication failed: {e}")
            raise DenyConnection("Authentication failed")

        return await super().__call__(scope, receive, send)
