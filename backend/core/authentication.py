"""
Custom JWT authentication with tenant validation.
"""
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from django.db import connection
from django.utils.translation import gettext_lazy as _


class TenantJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that validates tenant information.

    Returns appropriate HTTP status codes:
    - 403 Forbidden: Token missing tenant_id (old/invalid token)
    - 401 Unauthorized: Token tenant_id doesn't match current tenant
    """

    def get_validated_token(self, raw_token):
        """
        Validate token and check tenant information.

        Args:
            raw_token: Raw JWT token string

        Returns:
            Validated token object

        Raises:
            AuthenticationFailed: For missing tenant (403)
            InvalidToken: For tenant mismatches (401)
        """
        # First, validate the token using parent class
        validated_token = super().get_validated_token(raw_token)

        # Check if tenant_id exists in token
        tenant_id = validated_token.get('tenant_id')

        if tenant_id is None:
            # Token doesn't have tenant_id (old token or invalid)
            # Return 403 Forbidden
            raise AuthenticationFailed(
                _('Token does not contain tenant information'),
                code='forbidden'
            )

        # Get current tenant from connection
        current_tenant = getattr(connection, 'tenant', None)

        if current_tenant is None:
            # No tenant context in request
            raise AuthenticationFailed(
                _('No tenant context available'),
                code='forbidden'
            )

        # Compare token tenant with current tenant
        if tenant_id != current_tenant.id:
            # Tenant mismatch - return 401 Unauthorized
            raise InvalidToken(
                _('Token tenant does not match current tenant')
            )

        return validated_token


"""
Custom JWT tokens with tenant information.
"""


class TenantRefreshToken(RefreshToken):
    """
    Custom RefreshToken that includes tenant information in the payload.
    """

    @classmethod
    def for_user(cls, user):
        """
        Create token for user with tenant information.

        Args:
            user: User instance

        Returns:
            TenantRefreshToken instance with tenant claims

        Raises:
            ValueError: If no tenant context is available
        """
        # Get current tenant from connection
        tenant = getattr(connection, 'tenant', None)

        if tenant is None:
            raise ValueError(
                "No tenant context available during token generation")

        # Create the token
        token = super().for_user(user)

        # Add tenant information to token payload
        # These will be included in both refresh and access tokens
        token['tenant_id'] = tenant.id
        token['tenant_schema'] = tenant.schema_name

        return token

    @property
    def access_token(self):
        """
        Override to ensure tenant information is passed to access token.
        """
        access = super().access_token

        # Ensure tenant claims are copied to access token
        if 'tenant_id' in self.payload:
            access['tenant_id'] = self.payload['tenant_id']
        if 'tenant_schema' in self.payload:
            access['tenant_schema'] = self.payload['tenant_schema']

        return access


class TenantTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom TokenObtainPairSerializer that uses TenantRefreshToken.
    Used by dj-rest-auth via JWT_TOKEN_CLAIMS_SERIALIZER setting.
    """
    token_class = TenantRefreshToken
