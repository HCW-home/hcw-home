import secrets
from datetime import timedelta

from constance import config
from consultations.models import Participant
from django.conf import settings as django_settings
from django.contrib.contenttypes.models import ContentType
from django.shortcuts import render
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from messaging.models import Message
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from core.authentication import TenantRefreshToken
from users.models import User

MAX_VERIFICATION_ATTEMPTS = getattr(django_settings, "MAX_VERIFICATION_ATTEMPTS", 3)
TOKEN_GRACE_PERIOD = timedelta(
    minutes=getattr(django_settings, "TOKEN_GRACE_PERIOD_MINUTES", 5)
)


class AnonymousTokenAuthView(APIView):
    """
    Authenticate using auth_token and return JWT token.
    Within 5 minutes of token creation, no verification code is needed.
    After 5 minutes, a verification code is sent by email and must be provided.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Anonymous Token Authentication",
        description="Authenticate using auth_token and return JWT token. Within 5 minutes of token creation, direct access is granted. After that, a verification code is required.",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "auth_token": {
                        "type": "string",
                        "description": "Authentication token from participant",
                        "example": "550e8400-e29b-41d4-a716-446655440000",
                    },
                    "verification_code": {
                        "type": "string",
                        "description": "6-digit verification code (required if token grace period has expired)",
                        "example": "123456",
                        "minLength": 6,
                        "maxLength": 6,
                    },
                },
                "required": ["auth_token"],
            }
        },
        responses={
            200: {
                "description": "Authentication successful",
                "content": {
                    "application/json": {
                        "example": {
                            "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
                            "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
                            "user_id": 123,
                        }
                    }
                },
            },
            202: {
                "description": "Verification code sent",
                "content": {
                    "application/json": {
                        "example": {
                            "requires_verification": True,
                            "message": "Verification code sent. Please provide verification_code in next request.",
                        }
                    }
                },
            },
            400: {
                "description": "Bad request",
                "content": {
                    "application/json": {
                        "examples": {
                            "missing_token": {
                                "summary": "Missing auth token",
                                "value": {"error": "auth_token is required"},
                            },
                        }
                    }
                },
            },
            401: {
                "description": "Unauthorized",
                "content": {
                    "application/json": {
                        "examples": {
                            "invalid_token": {
                                "summary": "Invalid auth token",
                                "value": {"error": "Invalid auth_token"},
                            },
                            "invalid_code": {
                                "summary": "Invalid verification code",
                                "value": {"error": "Invalid verification_code"},
                            },
                        }
                    }
                },
            },
            429: {
                "description": "Too many attempts",
                "content": {
                    "application/json": {
                        "example": {
                            "error": "Too many verification attempts. Please request a new code."
                        }
                    }
                },
            },
        },
    )
    def post(self, request):
        auth_token = request.data.get("auth_token")
        verification_code = request.data.get("verification_code")

        if not auth_token:
            return Response(
                {"error": "auth_token is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(one_time_auth_token=auth_token)

            now = timezone.now()

            # Check if user is temporary without email or phone
            is_manual_access = (
                user.temporary
                and not user.email
                and not user.mobile_phone_number
            )

            if is_manual_access:
                # For temporary users without contact info, use longer expiry period
                token_expiry = timedelta(hours=config.temporary_participant_token_expiry_hours)
                token_valid = (
                    user.verification_code_created_at
                    and (now - user.verification_code_created_at) < token_expiry
                )

                if not token_valid:
                    return Response(
                        {"error": "Token expired. Please request a new access link."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

                # Token is valid, authenticate directly
                user.verification_code_created_at = now
                user.save(update_fields=["verification_code_created_at"])
            else:
                # For regular users, use grace period + verification code flow
                token_within_grace = (
                    user.verification_code_created_at
                    and (now - user.verification_code_created_at) < TOKEN_GRACE_PERIOD
                )

                if token_within_grace:
                    # Within grace period: direct authentication
                    user.verification_code_created_at = now
                    user.save(update_fields=["verification_code_created_at"])
                else:
                    # Grace period expired: verification code required
                    if not verification_code:
                        user.verification_code = 100000 + secrets.randbelow(900000)
                        user.verification_attempts = 0
                        user.save(
                            update_fields=["verification_code", "verification_attempts"]
                        )

                        Message.objects.create(
                            sent_to=user,
                            template_system_name="your_authentication_code",
                            content_type=ContentType.objects.get_for_model(user),
                            object_id=user.pk,
                        )

                        return Response(
                            {
                                "requires_verification": True,
                                "message": "Verification code sent. Please provide verification_code in next request.",
                            },
                            status=status.HTTP_202_ACCEPTED,
                        )

                    if user.verification_attempts >= MAX_VERIFICATION_ATTEMPTS:
                        user.verification_code = None

                        user.received_messages.filter(
                            template_system_name='your_authentication_code').delete()

                        user.verification_attempts = 0
                        user.save(
                            update_fields=["verification_code", "verification_attempts"]
                        )
                        return Response(
                            {
                                "error": "Too many verification attempts. Please request a new code."
                            },
                            status=status.HTTP_429_TOO_MANY_REQUESTS,
                        )

                    if str(user.verification_code).zfill(6) != str(verification_code).zfill(
                        6
                    ):
                        user.verification_attempts += 1
                        user.save(update_fields=["verification_attempts"])
                        return Response(
                            {"error": "Invalid verification_code"},
                            status=status.HTTP_401_UNAUTHORIZED,
                        )

                    # Successful verification: reset and start new grace period
                    user.verification_code = None

                    user.received_messages.filter(
                        template_system_name='your_authentication_code').delete()
                    
                    user.verification_attempts = 0
                    user.verification_code_created_at = now
                    user.save(
                        update_fields=[
                            "verification_code",
                            "verification_attempts",
                            "verification_code_created_at",
                        ]
                    )

            refresh = TenantRefreshToken.for_user(user)

            return Response(
                {
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user_id": user.id,
                    "tenant_id": refresh['tenant_id'],
                },
                status=status.HTTP_200_OK,
            )

        except User.DoesNotExist:
            return Response(
                {"error": "Invalid auth_token"}, status=status.HTTP_401_UNAUTHORIZED
            )
