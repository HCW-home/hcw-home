import logging
import mimetypes
import os
import random
import uuid
import secrets

from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from allauth.socialaccount.providers.openid_connect.views import (
    OpenIDConnectOAuth2Adapter,
)
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from consultations.models import (
    Appointment,
    Consultation,
    Participant,
    Reason,
    Request,
    RequestStatus,
)
from consultations.models import Message as ConsultationMessage
from consultations.permissions import IsPractitioner
from consultations.serializers import (
    AppointmentDetailSerializer,
    AppointmentSerializer,
    ConsultationMessageCreateSerializer,
    ConsultationMessageSerializer,
    ConsultationSerializer,
    ReasonSerializer,
    RequestSerializer,
)
from dj_rest_auth.registration.serializers import SocialLoginSerializer
from dj_rest_auth.registration.views import RegisterView as DjRestAuthRegisterView
from dj_rest_auth.registration.views import SocialLoginView
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import render
from django.utils import timezone, translation
from django.views.generic import View
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
)
from itsdangerous import URLSafeTimedSerializer
from mediaserver.models import Server
from messaging.models import Message
from messaging.serializers import MessageSerializer
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .filters import UserFilter
from .models import HealthMetric, Language, Organisation, Speciality, Term, User, WebPushSubscription
from .serializers import (
    HealthMetricSerializer,
    LanguageSerializer,
    OrganisationSerializer,
    SpecialitySerializer,
    TermSerializer,
    UserDetailsSerializer,
    UserParticipantDetailSerializer,
    WebPushSubscriptionSerializer,
)


class UniversalPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


User = get_user_model()


class Home(View):
    template_name = "useapp.html"

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name)


class LanguageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for languages - read only
    """

    queryset = Language.objects.all()
    serializer_class = LanguageSerializer
    permission_classes = [IsAuthenticated]


class TermViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for terms - read only
    """

    queryset = Term.objects.all()
    serializer_class = TermSerializer
    permission_classes = [IsAuthenticated]


class SpecialityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for specialities - read only
    """

    queryset = Speciality.objects.all()
    serializer_class = SpecialitySerializer
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ReasonSerializer(many=True))
    @action(detail=True, methods=["get"])
    def reasons(self, request, pk=None):
        """Get active reasons for this specialty"""
        specialty = self.get_object()
        reasons = specialty.reasons.filter(is_active=True)
        serializer = ReasonSerializer(reasons, many=True)
        return Response(serializer.data)

    @extend_schema(responses=UserDetailsSerializer(many=True))
    @action(detail=True, methods=["get"])
    def doctors(self, request, pk=None):
        """Get doctors for this specialty"""
        specialty = self.get_object()
        doctors = User.objects.filter(specialities=specialty)
        serializer = UserDetailsSerializer(doctors, many=True)
        return Response(serializer.data)

    @extend_schema(responses=OrganisationSerializer(many=True))
    @action(detail=True, methods=["get"])
    def organisations(self, request, pk=None):
        """Get organisations based on users with this specialty"""
        specialty = self.get_object()
        # Get users with this specialty who have a main_organisation
        users_with_specialty = User.objects.filter(
            specialities=specialty, main_organisation__isnull=False
        ).select_related("main_organisation")

        # Extract unique organizations
        organisations = []
        seen_org_ids = set()
        for user in users_with_specialty:
            if user.main_organisation.id not in seen_org_ids:
                organisations.append(user.main_organisation)
                seen_org_ids.add(user.main_organisation.id)

        serializer = OrganisationSerializer(organisations, many=True)
        return Response(serializer.data)


def generate_magic_token(user):
    serializer = URLSafeTimedSerializer(settings.SECRET_KEY)
    return serializer.dumps({"user_id": user.id})


def verify_magic_token(token, max_age=900):  # 15 minutes
    serializer = URLSafeTimedSerializer(settings.SECRET_KEY)
    return serializer.loads(token, max_age=max_age)


class UserParticipantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = UniversalPagination
    serializer_class = UserParticipantDetailSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        return Participant.objects.filter(user=user, is_active=True)


class UserConsultationsViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    pagination_class = UniversalPagination
    serializer_class = ConsultationSerializer

    def get_queryset(self):
        """Get consultations for the authenticated user."""
        user = self.request.user
        return Consultation.objects.filter(beneficiary=user, visible_by_patient=True)

    @extend_schema(
        responses={
            200: ConsultationSerializer,
            404: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "Not found."},
            },
        },
        description="Get a specific consultation by ID.",
    )
    def retrieve(self, request, *args, **kwargs):
        """Get a specific consultation by ID."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=ConsultationMessageCreateSerializer,
        responses={
            200: ConsultationMessageSerializer(many=True),
            201: ConsultationMessageSerializer,
            404: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "Consultation not found."},
            },
        },
        description="Get messages for this consultation (paginated) or create a new message.",
    )
    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        """Get messages for this consultation or create a new message."""
        consultation = self.get_object()

        if request.method == "GET":
            messages = consultation.messages.order_by("-created_at")

            # Apply pagination
            page = self.paginate_queryset(messages)
            if page is not None:
                serializer = ConsultationMessageSerializer(page, many=True)
                return self.get_paginated_response(serializer.data)

            serializer = ConsultationMessageSerializer(messages, many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = ConsultationMessageCreateSerializer(
                data=request.data, context={"request": request}
            )

            if serializer.is_valid():
                message = serializer.save(consultation=consultation)
                return Response(
                    ConsultationMessageSerializer(message).data,
                    status=status.HTTP_201_CREATED,
                )

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MessageAttachmentView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                "type": "string",
                "format": "binary",
                "description": "Binary file content with appropriate Content-Type and Content-Disposition headers",
            },
            404: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "Message not found or no attachment."},
            },
            403: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {
                    "detail": "You don't have permission to access this message."
                },
            },
        },
        description="Download attachment for a specific message. Returns the file as binary content with appropriate Content-Type header. User must have access to the consultation containing the message.",
    )
    def get(self, request, message_id):
        """Get attachment for a specific message if user has permission."""
        try:
            message = ConsultationMessage.objects.select_related("consultation").get(
                id=message_id
            )
        except ConsultationMessage.DoesNotExist:
            return Response(
                {"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND
            )

        user = request.user

        # Check if user has permission to access this consultation
        # Same logic as Consultation queryset: created_by, owned_by, or group member
        consultation = message.consultation

        has_access = (
            consultation.created_by == user
            or consultation.owned_by == user
            or consultation.group
            and consultation.group.users.filter(id=user.id).exists()
            or consultation.beneficiary == user
        )

        if not has_access:
            return Response(
                {"detail": "You don't have permission to access this message."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if message has an attachment
        if not message.attachment:
            return Response(
                {"detail": "Message has no attachment."},
                status=status.HTTP_404_NOT_FOUND,
            )

        file_name = os.path.basename(message.attachment.name)

        # Guess the content type
        content_type, _ = mimetypes.guess_type(file_name)
        if content_type is None:
            content_type = "application/octet-stream"

        # Open and return the file
        try:
            attachment_file = message.attachment.open("rb")
            response = FileResponse(attachment_file, content_type=content_type)
            response["Content-Disposition"] = f'inline; filename="{file_name}"'
            return response
        except FileNotFoundError:
            return Response(
                {"detail": "Attachment file not found."},
                status=status.HTTP_404_NOT_FOUND,
            )


class UserNotificationsView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = UniversalPagination

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="status",
                description="Filter notifications by status: 'read', 'delivered', 'sent', 'pending', 'failed'",
                required=False,
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                enum=["read", "delivered", "sent", "pending", "failed"],
            ),
            OpenApiParameter(
                name="page",
                description="Page number for pagination",
                required=False,
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
            ),
            OpenApiParameter(
                name="page_size",
                description="Number of results per page (max 100)",
                required=False,
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
            ),
        ],
        responses={
            200: MessageSerializer(many=True),
        },
        examples=[
            OpenApiExample(
                "Get paginated notifications",
                description="Returns paginated notifications for the user",
                value={
                    "count": 25,
                    "next": "http://localhost:8000/api/user/notifications/?page=2",
                    "previous": None,
                    "results": [
                        {
                            "id": 1,
                            "subject": "Consultation reminder",
                            "content": "Your consultation is scheduled for tomorrow",
                            "communication_method": "email",
                            "status": "delivered",
                            "sent_at": "2025-01-15T10:30:00Z",
                            "created_at": "2025-01-15T10:29:00Z",
                        }
                    ],
                },
                response_only=True,
            ),
        ],
        description="Get paginated notifications (messages) where the authenticated user is the recipient. Filter by message status. Default page size is 20, max 100.",
    )
    def get(self, request):
        """Get all notifications for the authenticated user as recipient."""
        notifications = Message.objects.filter(
            sent_to=request.user, in_notification=True
        )

        # Filter by status if provided
        status = request.query_params.get("status")
        if status:
            notifications = notifications.filter(status=status)

        notifications = notifications.order_by("-created_at")

        # Apply pagination
        paginator = self.pagination_class()
        paginated_notifications = paginator.paginate_queryset(notifications, request)
        serializer = MessageSerializer(paginated_notifications, many=True)
        return paginator.get_paginated_response(serializer.data)


class UserNotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: MessageSerializer,
            404: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "Notification not found."},
            },
            403: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {
                    "detail": "You don't have permission to mark this notification as read."
                },
            },
        },
        description="Mark a notification as read by populating the read_at field with the current timestamp. Only the recipient can mark their notification as read.",
    )
    def post(self, request, notification_id):
        """Mark a notification as read."""
        try:
            notification = Message.objects.get(id=notification_id)
        except Message.DoesNotExist:
            return Response(
                {"detail": "Notification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if the authenticated user is the recipient
        if notification.sent_to != request.user:
            return Response(
                {
                    "detail": "You don't have permission to mark this notification as read."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Mark as read by setting read_at to current time

        notification.read_at = timezone.now()
        notification.status = "read"
        notification.save()

        serializer = MessageSerializer(notification)
        return Response(serializer.data)


class UserNotificationsMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "detail": {"type": "string"},
                    "updated_count": {"type": "integer"},
                },
                "example": {
                    "detail": "All notifications marked as read.",
                    "updated_count": 15,
                },
            },
        },
        description="Mark all user notifications as read by setting status to 'read' and read_at to current timestamp for all notifications where the authenticated user is the recipient.",
    )
    def post(self, request):
        """Mark all user notifications as read."""
        # Get all notifications for the user that are not already read
        notifications = Message.objects.filter(sent_to=request.user).exclude(
            status="read"
        )

        # Update all notifications
        now = timezone.now()
        updated_count = notifications.update(status="read", read_at=now)

        return Response(
            {
                "detail": "All notifications marked as read.",
                "updated_count": updated_count,
            }
        )


class WebPushSubscribeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = WebPushSubscriptionSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WebPushUnsubscribeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get("endpoint")
        if not endpoint:
            return Response(
                {"detail": "endpoint is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = WebPushSubscription.objects.filter(
            user=request.user, endpoint=endpoint
        ).delete()
        if deleted:
            return Response({"detail": "Subscription removed."})
        return Response(
            {"detail": "Subscription not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


class UserAppointmentsViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    pagination_class = UniversalPagination
    serializer_class = AppointmentSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        """Get appointments where the authenticated user is an active participant."""
        return (
            Appointment.objects.filter(
                participant__user=self.request.user, participant__is_active=True
            )
            .distinct()
            .order_by("-scheduled_at")
        )

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Media server URL"},
                    "token": {
                        "type": "string",
                        "description": "JWT token for RTC connection",
                    },
                    "room": {"type": "string", "description": "Test room name"},
                },
                "example": {
                    "url": "wss://livekit.example.com",
                    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                    "room": "usertest_123",
                },
            },
            500: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "No media server available."},
            },
        },
        description="Get RTC test connection information for the authenticated user. Returns server URL, JWT token, and room name for testing WebRTC connection.",
    )
    @action(detail=True, methods=["get"])
    def join(self, request, pk=None):
        """Join consultation call"""
        appointment = self.get_object()
        if appointment.consultation.closed_at:
            return Response(
                {"error": "Cannot join call in closed consultation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            server = Server.get_server()

            consultation_call_info = server.instance.appointment_participant_info(
                appointment, request.user
            )

            # Send websocket notification to all active participants except the user who joined
            channel_layer = get_channel_layer()
            active_participants = appointment.participant_set.filter(is_active=True)

            for participant in active_participants:
                if participant.user.pk == request.user.pk:
                    continue

                async_to_sync(channel_layer.group_send)(
                    f"user_{participant.user.pk}",
                    {
                        "type": "appointment",
                        "consultation_id": appointment.consultation.pk,
                        "appointment_id": appointment.pk,
                        "state": "participant_joined",
                        "data": {
                            "user_id": request.user.pk,
                            "user_name": request.user.name or request.user.email,
                        },
                    },
                )

            return Response(
                {
                    "url": server.url,
                    "token": consultation_call_info,
                    "room": f"appointment_{appointment.pk}",
                }
            )
        except Exception as e:
            return Response(
                {"detail": "No media server available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for users - read only with GET endpoint
    Supports search by first name, last name, and email
    """

    queryset = User.objects.filter(
        Q(email__gt='') | Q(first_name__gt='') | Q(last_name__gt='')
    )
    serializer_class = UserDetailsSerializer
    permission_classes = [IsAuthenticated, IsPractitioner]
    pagination_class = UniversalPagination
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["first_name", "last_name", "email"]
    filterset_class = UserFilter

    def update(self, request, *args, **kwargs):
        """Prevent updating users with superuser, staff access, or users in groups."""
        user = self.get_object()

        # Prevent updating superusers and staff users
        if user.is_superuser or user.is_staff:
            return Response(
                {"detail": "Cannot update users with portal or super admin access."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Prevent updating users who belong to any group
        if user.groups.exists():
            return Response(
                {"detail": "Cannot update users who belong to a group."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Prevent partially updating users with superuser, staff access, or users in groups."""
        user = self.get_object()

        # Prevent updating superusers and staff users
        if user.is_superuser or user.is_staff:
            return Response(
                {"detail": "Cannot update users with portal or super admin access."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Prevent updating users who belong to any group
        if user.groups.exists():
            return Response(
                {"detail": "Cannot update users who belong to a group."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().partial_update(request, *args, **kwargs)


class OpenIDAdapter(OpenIDConnectOAuth2Adapter):
    """Custom OpenID Connect adapter for handling callback URLs from frontend"""

    provider_id = "openid"

    def __init__(self, request):
        super().__init__(request, provider_id="openid")

    def get_callback_url(self, request, app):
        """Use callback_url from frontend request if provided"""
        if hasattr(request, "data") and "callback_url" in request.data:
            return request.data["callback_url"]
        return super().get_callback_url(request, app)


class CustomOAuth2Client(OAuth2Client):
    _pkce_code_verifier = None

    def __init__(
        self,
        request,
        consumer_key,
        consumer_secret,
        access_token_method,
        access_token_url,
        callback_url,
        _scope=None,
        scope_delimiter=" ",
        headers=None,
        basic_auth=False,
    ):
        super().__init__(
            request,
            consumer_key,
            consumer_secret,
            access_token_method,
            access_token_url,
            callback_url,
            scope_delimiter=scope_delimiter,
            headers=headers,
            basic_auth=basic_auth,
        )

    def get_access_token(self, code, pkce_code_verifier=None):
        # Use stored PKCE verifier if not provided as parameter
        if pkce_code_verifier is None and self._pkce_code_verifier is not None:
            pkce_code_verifier = self._pkce_code_verifier

        try:
            result = super().get_access_token(code, pkce_code_verifier)
            self._pkce_code_verifier = None
            return result
        except Exception as e:
            self._pkce_code_verifier = None
            logger = logging.getLogger(__name__)
            logger.error(f"OpenID token exchange failed: {e}")
            raise


class OpenIDView(SocialLoginView):
    """OpenID Connect login view with PKCE support"""

    adapter_class = OpenIDAdapter
    serializer_class = SocialLoginSerializer
    client_class = CustomOAuth2Client

    def post(self, request, *args, **kwargs):
        # Get origin from request headers
        origin = request.META.get("HTTP_ORIGIN", request.META.get("HTTP_REFERER", ""))
        if origin.endswith("/"):
            origin = origin[:-1]

        # Set callback URL dynamically
        callback_url = f"{origin}/auth/callback"
        self.callback_url = callback_url

        # Store PKCE code_verifier if present (for PKCE flow)
        if "code_verifier" in request.data:
            CustomOAuth2Client._pkce_code_verifier = request.data["code_verifier"]
        else:
            CustomOAuth2Client._pkce_code_verifier = None

        # Add callback_url to request data if not present
        if "code" in request.data and "callback_url" not in request.data:
            request.data["callback_url"] = callback_url

        return super().post(request, *args, **kwargs)


class AppConfigView(APIView):
    """
    Public endpoint returning application configuration for the frontend.
    Includes OpenID, registration settings, and main organization info.
    """

    permission_classes = []
    authentication_classes = []

    @extend_schema(
        description="Get application configuration for the frontend.",
    )
    def get(self, request):
        # OpenID Connect configuration
        openid_config = settings.SOCIALACCOUNT_PROVIDERS.get("openid_connect", {})
        apps = openid_config.get("APPS", [])

        openid = {
            "enabled": False,
            "client_id": None,
            "authorization_url": None,
            "provider_name": None,
        }

        if apps:
            app = apps[0]
            client_id = app.get("client_id")
            provider_name = app.get("name")
            server_url = app.get("settings", {}).get("server_url")

            authorization_url = None
            if server_url:
                base_url = server_url.replace("/.well-known/openid-configuration", "")
                authorization_url = f"{base_url}/protocol/openid-connect/auth"

            openid = {
                "enabled": bool(client_id),
                "client_id": client_id,
                "authorization_url": authorization_url,
                "provider_name": provider_name,
            }

        # Main organization
        main_org = Organisation.objects.filter(is_main=True).first()
        main_organization = OrganisationSerializer(main_org, context={"request": request}).data if main_org else None

        from constance import config as constance_config

        def _image_url(image_field):
            if not image_field:
                return None
            return request.build_absolute_uri(image_field.url)

        languages = [
            {"code": code, "name": str(name)} for code, name in settings.LANGUAGES
        ]

        from messaging.models import MessagingProvider

        communication_methods = list(
            MessagingProvider.objects.filter(is_active=True)
            .values_list("communication_method", flat=True)
            .distinct()
        )

        return Response(
            {
                **openid,
                "registration_enabled": settings.ENABLE_REGISTRATION,
                "main_organization": main_organization,
                "branding": constance_config.site_name,
                "primary_color_patient": main_org.primary_color_patient if main_org else None,
                "primary_color_practitioner": main_org.primary_color_practitioner if main_org else None,
                "languages": languages,
                "communication_methods": communication_methods,
                "vapid_public_key": settings.WEBPUSH_VAPID_PUBLIC_KEY,
            }
        )


class RegisterView(DjRestAuthRegisterView):
    """Registration endpoint controlled by ENABLE_REGISTRATION setting."""

    def create(self, request, *args, **kwargs):
        if not settings.ENABLE_REGISTRATION:
            return Response(
                {"detail": "Registration is currently disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )
        super().create(request, *args, **kwargs)

        # Send email verification message
        email = request.data.get("email")
        if email:
            user = User.objects.filter(email=email).first()
            if user and not user.email_verified:
                user.email_verification_token = str(uuid.uuid4())
                user.save(update_fields=["email_verification_token"])
                Message.objects.create(
                    sent_to=user,
                    template_system_name="email_verification",
                    content_type=ContentType.objects.get_for_model(user),
                    object_id=user.pk,
                    in_notification=False,
                    additionnal_link_args={"token": user.email_verification_token},
                )

        return Response(
            {"detail": "A verification email has been sent to your email address."},
            status=status.HTTP_201_CREATED,
        )


class EmailVerifyView(APIView):
    """Verify user email address via token."""

    permission_classes = []
    authentication_classes = []

    def get(self, request):
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"detail": "Verification token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(email_verification_token=token).first()
        if not user:
            return Response(
                {"detail": "Invalid or expired verification token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.email_verified = True
        user.email_verification_token = None
        user.save(update_fields=["email_verified", "email_verification_token"])

        return Response({"detail": "Email verified successfully."})


class TestRTCView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Media server URL"},
                    "token": {
                        "type": "string",
                        "description": "JWT token for RTC connection",
                    },
                    "room": {"type": "string", "description": "Test room name"},
                },
                "example": {
                    "url": "wss://livekit.example.com",
                    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                    "room": "usertest_123",
                },
            },
            500: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
                "example": {"detail": "No media server available."},
            },
        },
        description="Get RTC test connection information for the authenticated user. Returns server URL, JWT token, and room name for testing WebRTC connection.",
    )
    def get(self, request):
        """Get RTC test information for the authenticated user."""
        try:
            server = Server.get_server()

            test_info = server.instance.user_test_info(request.user)

            return Response(
                {
                    "url": server.url,
                    "token": test_info,
                    "room": f"usertest_{request.user.pk}",
                }
            )
        except Exception as e:
            return Response(
                {"detail": "No media server available."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UserDashboardView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "requests": {
                        "type": "array",
                        "description": "Last 10 requests created by the user",
                    },
                    "consultations": {
                        "type": "array",
                        "description": "Last 10 consultations where the user is the beneficiary",
                    },
                    "appointments": {
                        "type": "array",
                        "description": "Last 10 appointments where the user is a participant",
                    },
                },
            },
        },
        description="Get dashboard data for the authenticated user: 10 requests, 10 consultations (as beneficiary), and 10 appointments.",
    )
    def get(self, request):
        """Get dashboard data for the authenticated user."""
        user = request.user
        now = timezone.now()
        two_hours_ago = now - timezone.timedelta(hours=2)

        user_requests = (
            Request.objects.filter(
                created_by=user,
            )
            .filter(
                Q(status__in=[RequestStatus.requested, RequestStatus.refused])
                | Q(
                    status=RequestStatus.accepted,
                    consultation__closed_at__isnull=True,
                )
                | Q(
                    status=RequestStatus.accepted,
                    appointment__scheduled_at__gte=two_hours_ago,
                    appointment__status="scheduled",
                )
            )
            .order_by("-id")
        )

        consultations = (
            Consultation.objects.exclude(request__in=user_requests)
            .filter(beneficiary=user, closed_at__isnull=True, visible_by_patient=True)
            .order_by("-created_at")
        )

        # Next upcoming appointment (with 2 hour grace period)
        next_appointment = (
            Appointment.objects.filter(
                participant__user=user,
                participant__is_active=True,
                scheduled_at__gte=two_hours_ago,
                status="scheduled",
            )
            .distinct()
            .order_by("scheduled_at")
            .first()
        )

        appointments = (
            Appointment.objects.exclude(consultation__in=consultations)
            .exclude(
                consultation__request__in=user_requests,
            ).filter(
                participant__user=user,
                participant__is_active=True,
                scheduled_at__gte=two_hours_ago,
                status="scheduled",
            )
            .distinct()
            .order_by("scheduled_at")
        )

        serializer_context = {"request": request}

        has_reasons = Reason.objects.filter(is_active=True).exists()

        return Response(
            {
                "has_reasons": has_reasons,
                "next_appointment": AppointmentSerializer(
                    next_appointment, context=serializer_context
                ).data
                if next_appointment
                else None,
                "requests": RequestSerializer(
                    user_requests, many=True, context=serializer_context
                ).data,
                "consultations": ConsultationSerializer(
                    consultations, many=True, context=serializer_context
                ).data,
                "appointments": AppointmentSerializer(
                    appointments, many=True, context=serializer_context
                ).data,
            }
        )


class SendVerificationCodeView(APIView):
    """
    Generate and send a verification code to a contact's email for passwordless authentication.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Send Verification Code",
        description="Generate and send a verification code for passwordless authentication. Automatically detects if the email belongs to a contact or user.",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "email": {
                        "type": "string",
                        "format": "email",
                        "description": "Email address to send the verification code to",
                        "example": "user@example.com",
                    },
                },
                "required": ["email"],
            }
        },
        responses={
            200: {
                "description": "Verification code sent successfully",
                "content": {
                    "application/json": {
                        "example": {"detail": "Verification code sent successfully"}
                    }
                },
            },
            400: {
                "description": "Bad request",
                "content": {
                    "application/json": {"example": {"error": "email is required"}}
                },
            },
        },
    )
    def post(self, request):
        email = request.data.get("email")

        if not email:
            return Response(
                {"error": "email is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Try to find contact first, then user
        user_instance = None

        try:
            # Try to get User
            user_instance = User.objects.get(email__iexact=email.strip())
        except User.DoesNotExist:
            return Response(
                {"detail": "Verification code sent successfully"},
                status=status.HTTP_200_OK,
            )

        # Generate a verification code (6 digits)
        user_instance.verification_code = 100000 + secrets.randbelow(900000)
        user_instance.verification_code_created_at = timezone.now()

        user_instance.one_time_auth_token = str(uuid.uuid4())
        user_instance.verification_attempts = 0
        user_instance.save(
            update_fields=[
                "verification_code",
                "verification_code_created_at",
                "verification_attempts",
                "one_time_auth_token",
            ]
        )

        # Render HTML template
        with translation.override(user_instance.preferred_language):
            Message.objects.create(
                sent_to=user_instance,
                template_system_name="your_authentication_code",
                content_type=ContentType.objects.get_for_model(user_instance),
                object_id=user_instance.pk,
            )

        return Response(
            {
                "detail": "Verification code sent successfully",
                "auth_token": user_instance.one_time_auth_token,
            },
            status=status.HTTP_200_OK,
        )
