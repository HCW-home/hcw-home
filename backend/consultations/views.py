from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import boto3
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from core.mixins import CreatedByMixin
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
)
from mediaserver.models import Server
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .fhir import AppointmentFhir
from .filters import AppointmentFilter, ConsultationFilter
from .models import (
    Appointment,
    AppointmentStatus,
    BookingSlot,
    Consultation,
    CustomField,
    Message,
    Participant,
    Queue,
    Reason,
    Request,
    RequestStatus,
    Type,
)
from .paginations import ConsultationPagination
from .permissions import IsPractitioner
from .renderers import FHIRRenderer
from .serializers import (
    AppointmentCreateSerializer,
    AppointmentSerializer,
    BookingSlotSerializer,
    ConsultationMessageCreateSerializer,
    ConsultationMessageSerializer,
    ConsultationSerializer,
    CustomFieldSerializer,
    ParticipantDetailSerializer,
    QueueSerializer,
    RequestSerializer,
)

User = get_user_model()


@dataclass
class Slot:
    date: date
    start_time: time
    end_time: time
    duration: int
    user_id: int
    user_email: str
    user_first_name: str
    user_last_name: str


class ConsultationViewSet(CreatedByMixin, viewsets.ModelViewSet):
    """Consultation endpoint"""

    queryset = Consultation.objects.all()
    serializer_class = ConsultationSerializer
    permission_classes = [IsAuthenticated, IsPractitioner]
    pagination_class = ConsultationPagination
    filterset_class = ConsultationFilter
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = [
        "title",
        "description",
        "beneficiary__first_name",
        "beneficiary__last_name",
        "beneficiary__email",
        "created_by__first_name",
        "created_by__last_name",
        "owned_by__first_name",
        "owned_by__last_name",
        "group__name",
    ]
    ordering = ["-created_at"]
    ordering_fields = ["created_at", "updated_at", "closed_at"]

    def get_queryset(self):
        user = self.request.user
        return Consultation.objects.accessible_by(user)

    @extend_schema(responses=ConsultationSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close a consultation"""
        consultation = self.get_object()
        if consultation.closed_at is not None:
            return Response(
                {"error": "This consultation is already closed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        if consultation.appointments.filter(
            scheduled_at__gt=now, status=AppointmentStatus.scheduled
        ).exists():
            return Response(
                {
                    "error": _(
                        "Unable to close consultation with appointment scheduled in future"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        consultation.closed_at = timezone.now()
        consultation.save()

        serializer = self.get_serializer(consultation)
        return Response(serializer.data)

    @extend_schema(responses=ConsultationSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Reopen a consultation"""
        consultation = self.get_object()
        if consultation.closed_at is None:
            return Response(
                {"error": "This consultation is already open"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consultation.closed_at = None
        consultation.save()

        serializer = self.get_serializer(consultation)
        return Response(serializer.data)

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
            400: {
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
        consultation = self.get_object()
        if consultation.closed_at:
            return Response(
                {"error": "Cannot join call in closed consultation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            server = Server.get_server()

            consultation_call_info = server.instance.consultation_user_info(
                consultation, request.user
            )

            return Response(
                {
                    "url": server.url,
                    "token": consultation_call_info,
                    "room": f"consultation_{consultation.pk}",
                }
            )
        except Exception as e:
            return Response(
                {"detail": "No media server available."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @extend_schema(methods=["GET"], responses=ConsultationMessageSerializer(many=True))
    @extend_schema(
        methods=["POST"],
        request=ConsultationMessageCreateSerializer,
        responses={201: ConsultationMessageSerializer},
    )
    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        """Get all messages for this consultation or create a new message"""
        consultation = self.get_object()

        if request.method == "GET":
            messages = consultation.messages.order_by("-created_at")

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

    @extend_schema(
        responses={200: ConsultationSerializer(many=True)},
        description="Get overdue consultations where either:\n"
        "1. All appointments are more than 1 hour in the past, OR\n"
        "2. The last message was sent by the beneficiary",
    )
    @action(detail=False, methods=["get"], url_path="overdue")
    def overdue(self, request):
        """Get consultations that need attention (overdue)"""

        # Get consultations the user has access to
        queryset = self.filter_queryset(self.get_queryset().overdue)
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @extend_schema(
        responses={200: {"type": "string", "format": "binary"}},
        description="Export consultation data as a PDF document.",
    )
    @action(detail=True, methods=["get"], url_path="export/pdf")
    def export_pdf(self, request, pk=None):
        from .pdf_export import generate_consultation_pdf

        consultation = self.get_object()

        appointments = (
            consultation.appointments.all()
            .prefetch_related("participant_set__user")
            .select_related("created_by")
            .order_by("scheduled_at")
        )

        messages = (
            consultation.messages.filter(deleted_at__isnull=True)
            .select_related("created_by")
            .order_by("created_at")
        )

        organisation = request.user.main_organisation

        pdf_buffer = generate_consultation_pdf(
            consultation=consultation,
            appointments=appointments,
            messages=messages,
            organisation=organisation,
        )

        title_slug = slugify(consultation.title or "")
        filename = f"consultation_{consultation.pk}"
        if title_slug:
            filename += f"_{title_slug}"
        filename += ".pdf"

        response = HttpResponse(
            pdf_buffer.read(),
            content_type="application/pdf",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class AppointmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for appointments - provides CRUD operations (except DELETE)
    Supports FHIR format by adding ?format=fhir query parameter
    """

    queryset = Appointment.objects.all()
    fhir_class = AppointmentFhir
    permission_classes = [IsAuthenticated, IsPractitioner]
    pagination_class = ConsultationPagination
    ordering_fields = ["created_at", "updated_at", "scheduled_at"]
    # filterset_fields = ["consultation", "status"]
    http_method_names = ["get", "post", "patch", "put", "head", "options"]
    filterset_class = AppointmentFilter

    def get_serializer_class(self):
        if self.action == "create":
            return AppointmentCreateSerializer
        return AppointmentSerializer

    def get_renderers(self):
        if self.action in ["list", "retrieve"]:
            return super().get_renderers() + [FHIRRenderer()]
        return super().get_renderers()

    def get_queryset(self):
        user = self.request.user

        # For list, retrieve, and join actions: filter by participants or consultation access
        if self.action in ["list", "retrieve", "join"]:
            return Appointment.objects.filter(
                Q(participant__user=user, participant__is_active=True)
                | Q(consultation__in=Consultation.objects.accessible_by(user))
            ).distinct()

        # For create, update, partial_update, etc.: use consultation access logic
        return Appointment.objects.filter(
            consultation__in=Consultation.objects.accessible_by(user)
        ).distinct()

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
                {"detail": _("Cannot join call in closed consultation")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if appointment.type != Type.online:
            return Response(
                {"detail": _("Cannot join consultation if not online")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        earliest_join = appointment.scheduled_at - timedelta(minutes=5)
        if now < earliest_join:
            return Response(
                {
                    "detail": _("Too early to join. The meeting starts at %(time)s. You can join 5 minutes before the scheduled time.")
                    % {"time": appointment.scheduled_at.strftime("%H:%M")},
                    "scheduled_at": appointment.scheduled_at.isoformat(),
                    "code": "too_early",
                },
                status=status.HTTP_403_FORBIDDEN,
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
                status=status.HTTP_404_NOT_FOUND,
            )

    @extend_schema(responses=AppointmentSerializer)
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        """Send an appointment (change status to SCHEDULED)"""
        appointment = self.get_object()
        if appointment.status == AppointmentStatus.scheduled:
            return Response(
                {"error": "This appointment is already scheduled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment.status = AppointmentStatus.scheduled
        appointment.save()

        serializer = self.get_serializer(appointment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def start_recording(self, request, pk=None):
        """Start recording the appointment (doctors only)"""
        from .models import AppointmentRecording

        appointment = self.get_object()
        consultation = appointment.consultation

        # Permission check: only doctors in Queue
        if not self._is_doctor(request.user, consultation):
            return Response(
                {"error": _("Only doctors can start recording")},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if already recording
        active_recording = AppointmentRecording.objects.filter(
            appointment=appointment, stopped_at__isnull=True
        ).first()
        if active_recording:
            return Response(
                {"error": _("Recording already in progress")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        room_name = f"appointment_{appointment.pk}"

        try:
            server = Server.get_server()
            egress_id, filepath = async_to_sync(server.instance.start_room_recording)(
                room_name, appointment.pk
            )

            AppointmentRecording.objects.create(
                appointment=appointment,
                egress_id=egress_id,
                filepath=filepath,
            )

            return Response({"status": "recording_started"})
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"])
    def stop_recording(self, request, pk=None):
        """Stop recording the appointment"""
        from .models import AppointmentRecording
        from .tasks import check_recording_ready

        appointment = self.get_object()
        consultation = appointment.consultation

        # Permission check
        if not self._is_doctor(request.user, consultation):
            return Response(
                {"error": _("Only doctors can stop recording")},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Find active recording
        recording = AppointmentRecording.objects.filter(
            appointment=appointment, stopped_at__isnull=True
        ).last()
        if not recording:
            return Response(
                {"error": _("No recording in progress")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            server = Server.get_server()
            async_to_sync(server.instance.stop_room_recording)(recording.egress_id)

            recording.stopped_at = timezone.now()
            recording.save(update_fields=["stopped_at"])

            check_recording_ready.apply_async(
                args=[recording.pk], countdown=settings.RECORDING_CHECK_INITIAL_DELAY
            )

            return Response({"status": "recording_stopped"})
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _is_doctor(self, user, consultation):
        """Check if user is a doctor (in Queue group)"""
        if not consultation:
            return False
        # Check if user is in consultation's group (Queue)
        if consultation.group and user in consultation.group.users.all():
            return True
        # Check if user owns the consultation
        if consultation.owned_by == user or consultation.created_by == user:
            return True
        return False


class ParticipantViewSet(viewsets.ModelViewSet):
    """
    ViewSet for participants - provides CRUD operations (except DELETE)
    To remove a participant, update is_active to False
    """

    serializer_class = ParticipantDetailSerializer
    permission_classes = [IsAuthenticated, IsPractitioner]
    pagination_class = ConsultationPagination
    ordering = ["-id"]
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Participant.objects.none()

        # Return active participants from appointments in consultations the user has access to
        return Participant.objects.filter(
            is_active=True,
            appointment__consultation__in=Consultation.objects.filter(
                Q(created_by=user) | Q(owned_by=user) | Q(group__users=user)
            ),
        ).distinct()

    def perform_create(self, serializer):
        # When creating via direct participant endpoint, appointment must be provided
        serializer.save()


class QueueViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for queues - read only
    Users can only see queues they belong to
    """

    serializer_class = QueueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Queue.objects.none()

        # Return queues where:
        # 1. User is directly assigned to the queue, OR
        # 2. Queue has no organizations (public queues), OR
        # 3. Queue belongs to an organization the user is a member of
        from django.db.models import Count, Q

        return (
            Queue.objects.annotate(org_count=Count("organisation"))
            .filter(
                Q(users=user)
                | Q(org_count=0)
                | Q(organisation__in=user.organisations.all())
            )
            .distinct()
        )


class RequestViewSet(CreatedByMixin, viewsets.ModelViewSet):
    """
    ViewSet for consultation requests
    Users can create requests and view their own requests
    """

    serializer_class = RequestSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]  # Remove PUT, PATCH, DELETE

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Request.objects.none()

        # Users can see requests they created
        return Request.objects.filter(created_by=user)

    @extend_schema(responses=RequestSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a consultation request"""
        consultation_request = self.get_object()

        if consultation_request.status == RequestStatus.cancelled:
            return Response(
                {"error": "This request is already cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consultation_request.status = RequestStatus.cancelled
        consultation_request.save()

        serializer = self.get_serializer(consultation_request)
        return Response(serializer.data)


class ReasonSlotsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="from_date",
                description="Start date for slot search (default: today). Format: YYYY-MM-DD",
                required=False,
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
            ),
            OpenApiParameter(
                name="user_id",
                description="Filter slots for a specific practitioner",
                required=False,
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
            ),
            OpenApiParameter(
                name="organisation_id",
                description="Filter slots for practitioners from a specific organisation",
                required=False,
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
            ),
        ],
        responses={
            200: {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "format": "date"},
                        "start_time": {"type": "string", "format": "time"},
                        "end_time": {"type": "string", "format": "time"},
                        "duration": {"type": "integer"},
                        "user_id": {"type": "integer"},
                        "user_email": {"type": "string"},
                        "user_first_name": {"type": "string"},
                        "user_last_name": {"type": "string"},
                    },
                },
            }
        },
        examples=[
            OpenApiExample(
                "Available slots",
                description="Returns available time slots for practitioners",
                value=[
                    {
                        "date": "2025-01-16",
                        "start_time": "09:00:00",
                        "end_time": "09:30:00",
                        "duration": 30,
                        "user_id": 5,
                        "user_email": "doctor@example.com",
                        "user_first_name": "Dr. John",
                        "user_last_name": "Smith",
                    }
                ],
                response_only=True,
            ),
        ],
        description="Get available time slots for practitioners based on a reason. Returns slots for the next 7 days from the specified date.",
    )
    def get(self, request, id):
        """Get available slots for practitioners based on reason."""
        try:
            reason = Reason.objects.get(id=id, is_active=True)
        except Reason.DoesNotExist:
            return Response(
                {"error": "Reason not found or inactive"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if reason.duration <= 0:
            return Response(
                {"error": "Invalid reason duration"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_date_str = request.query_params.get("from_date")
        if from_date_str:
            try:
                from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            from_date = timezone.now().date()

        user_id_filter = request.query_params.get("user_id")
        if user_id_filter:
            try:
                user_id_filter = int(user_id_filter)
            except ValueError:
                return Response(
                    {"error": "Invalid user_id"}, status=status.HTTP_400_BAD_REQUEST
                )

        organisation_id_filter = request.query_params.get("organisation_id")
        if organisation_id_filter:
            try:
                organisation_id_filter = int(organisation_id_filter)
            except ValueError:
                return Response(
                    {"error": "Invalid organisation_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        practitioners_query = User.objects.filter(specialities=reason.speciality)
        if user_id_filter:
            practitioners_query = practitioners_query.filter(id=user_id_filter)
        if organisation_id_filter:
            practitioners_query = practitioners_query.filter(
                main_organisation_id=organisation_id_filter
            )

        practitioners = list(practitioners_query)
        if not practitioners:
            return Response([], status=status.HTTP_200_OK)

        dates = [from_date + timedelta(days=i) for i in range(7)]

        booking_slots = BookingSlot.objects.filter(
            user__in=practitioners
        ).select_related("user")

        end_date = from_date + timedelta(days=7)
        existing_appointments = Appointment.objects.filter(
            scheduled_at__date__gte=from_date,
            scheduled_at__date__lt=end_date,
            status=AppointmentStatus.scheduled,
        ).select_related("consultation")

        appointment_lookup = {}
        for apt in existing_appointments:
            consultation = apt.consultation
            if consultation.owned_by:
                practitioner_id = consultation.owned_by.id
                apt_start = apt.scheduled_at
                apt_end = apt.end_expected_at or (
                    apt_start + timedelta(minutes=reason.duration)
                )

                if practitioner_id not in appointment_lookup:
                    appointment_lookup[practitioner_id] = []
                appointment_lookup[practitioner_id].append((apt_start, apt_end))

        available_slots = []
        seen_slots = set()

        for practitioner in practitioners:
            practitioner_slots = booking_slots.filter(user=practitioner)

            for booking_slot in practitioner_slots:
                if booking_slot.start_time >= booking_slot.end_time:
                    continue

                for target_date in dates:
                    if (
                        booking_slot.valid_until
                        and booking_slot.valid_until <= target_date
                    ):
                        continue

                    weekday = target_date.weekday()
                    day_enabled = (
                        (weekday == 0 and booking_slot.monday)
                        or (weekday == 1 and booking_slot.tuesday)
                        or (weekday == 2 and booking_slot.wednesday)
                        or (weekday == 3 and booking_slot.thursday)
                        or (weekday == 4 and booking_slot.friday)
                        or (weekday == 5 and booking_slot.saturday)
                        or (weekday == 6 and booking_slot.sunday)
                    )

                    if not day_enabled:
                        continue

                    current_time = booking_slot.start_time
                    end_time = booking_slot.end_time
                    slot_duration_delta = timedelta(minutes=reason.duration)

                    iteration_count = 0
                    max_iterations = 200

                    while current_time < end_time:
                        iteration_count += 1
                        if iteration_count > max_iterations:
                            break

                        current_datetime = datetime.combine(target_date, current_time)
                        slot_end_datetime = current_datetime + slot_duration_delta

                        if slot_end_datetime.date() != target_date:
                            break

                        slot_end_time = slot_end_datetime.time()

                        if slot_end_time > end_time:
                            break

                        if (
                            booking_slot.start_break
                            and booking_slot.end_break
                            and booking_slot.start_break < booking_slot.end_break
                        ):
                            if (
                                current_time < booking_slot.end_break
                                and slot_end_time > booking_slot.start_break
                            ):
                                if booking_slot.end_break < end_time:
                                    current_time = booking_slot.end_break
                                else:
                                    break
                                continue

                        slot_start_aware = timezone.make_aware(current_datetime)
                        slot_end_aware = timezone.make_aware(slot_end_datetime)

                        slot_conflicts = False
                        practitioner_appointments = appointment_lookup.get(
                            practitioner.id, []
                        )

                        for apt_start, apt_end in practitioner_appointments:
                            if (
                                slot_start_aware < apt_end
                                and slot_end_aware > apt_start
                            ):
                                slot_conflicts = True
                                break

                        if not slot_conflicts:
                            slot_key = (target_date, current_time, practitioner.id)

                            if slot_key not in seen_slots:
                                seen_slots.add(slot_key)
                                available_slots.append(
                                    Slot(
                                        date=target_date,
                                        start_time=current_time,
                                        end_time=slot_end_time,
                                        duration=reason.duration,
                                        user_id=practitioner.id,
                                        user_email=practitioner.email,
                                        user_first_name=practitioner.first_name or "",
                                        user_last_name=practitioner.last_name or "",
                                    )
                                )

                        current_time = slot_end_time

        slots_data = [
            {
                "date": slot.date.isoformat(),
                "start_time": slot.start_time.isoformat(),
                "end_time": slot.end_time.isoformat(),
                "duration": slot.duration,
                "user_id": slot.user_id,
                "user_email": slot.user_email,
                "user_first_name": slot.user_first_name,
                "user_last_name": slot.user_last_name,
            }
            for slot in available_slots
        ]

        return Response(slots_data, status=status.HTTP_200_OK)


class BookingSlotViewSet(CreatedByMixin, viewsets.ModelViewSet):
    serializer_class = BookingSlotSerializer
    permission_classes = [IsAuthenticated, IsPractitioner]
    pagination_class = ConsultationPagination
    filterset_fields = [
        "user",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "valid_until",
    ]
    ordering = ["-id"]
    ordering_fields = ["id", "start_time", "end_time", "valid_until"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return BookingSlot.objects.none()

        # Users can only see their own booking slots
        return BookingSlot.objects.filter(user=user)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance

        # Ensure user can only update their own booking slots
        if instance.user != user:
            raise PermissionDenied("You can only update your own booking slots.")

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        # Ensure user can only delete their own booking slots
        if instance.user != user:
            raise PermissionDenied("You can only delete your own booking slots.")

        instance.delete()


class MessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for messages - provides PATCH and DELETE operations
    Users can only edit/delete their own messages
    """

    serializer_class = ConsultationMessageSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Message.objects.none()

        # Return messages from consultations the user has access to
        return Message.objects.filter(
            consultation__in=Consultation.objects.filter(
                Q(created_by=user)
                | Q(owned_by=user)
                | Q(group__users=user)
                | Q(beneficiary=user)
            )
        ).distinct()

    def update(self, request, *args, **kwargs):
        """PATCH - Update message content or attachment"""

        partial = kwargs.pop("partial", True)  # Force partial update
        instance = self.get_object()

        # Only allow the creator to update their own message
        if instance.created_by != request.user:
            raise PermissionDenied("You can only edit your own messages.")

        # Don't allow updating deleted messages
        if instance.deleted_at:
            return Response(
                {"error": "Cannot edit a deleted message"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """DELETE - Soft delete by setting content/attachment to null and populating deleted_at"""
        instance = self.get_object()

        # Only allow the creator to delete their own message
        if instance.created_by != request.user:
            raise PermissionDenied("You can only delete your own messages.")

        # Check if already deleted
        if instance.deleted_at:
            return Response(
                {"error": "Message already deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Soft delete: set content and attachment to null, populate deleted_at
        instance.content = None
        instance.attachment = None
        instance.deleted_at = timezone.now()
        instance.save()

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def download_recording(self, request, pk=None):
        """Download recording from S3 through proxy"""
        message = self.get_object()

        # Check if message has a recording
        if not message.recording_url:
            return Response(
                {"error": "This message does not have a recording"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            # Initialize S3 client
            s3_client = boto3.client(
                "s3",
                endpoint_url=settings.LIVEKIT_S3_ENDPOINT_URL,
                aws_access_key_id=settings.LIVEKIT_S3_ACCESS_KEY,
                aws_secret_access_key=settings.LIVEKIT_S3_SECRET_KEY,
            )

            # Get file from S3 using recording_url as the key
            response = s3_client.get_object(
                Bucket=settings.LIVEKIT_S3_BUCKET_NAME, Key=message.recording_url
            )

            # Extract filename from S3 key
            filename = message.recording_url.split("/")[-1]

            # Stream the file back to the user
            streaming_response = StreamingHttpResponse(
                response["Body"].iter_chunks(chunk_size=8192),
                content_type=response.get("ContentType", "video/mp4"),
            )
            streaming_response["Content-Disposition"] = (
                f'attachment; filename="{filename}"'
            )
            streaming_response["Content-Length"] = response.get("ContentLength", 0)

            return streaming_response

        except Exception as e:
            return Response(
                {"error": f"Failed to download recording: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CustomFieldViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only endpoint to list available custom fields, filterable by target_model."""
    serializer_class = CustomFieldSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["target_model"]

    def get_queryset(self):
        return CustomField.objects.all()


class DashboardPractitionerView(APIView):
    """
    Vue personnalisée pour afficher les statistiques du tableau de bord du praticien
    """

    permission_classes = [IsAuthenticated, IsPractitioner]

    def get(self, request):
        """Récupère les statistiques personnalisées du praticien"""
        user = request.user

        now = timezone.now() - timedelta(minutes=30)
        tomorrow = timezone.now().date() + timedelta(days=1)

        # Consultations accessibles par l'utilisateur
        consultations_qs = Consultation.objects.accessible_by(user).active

        upcoming_appointments = Appointment.objects.filter(
            consultation__in=consultations_qs,
            status=AppointmentStatus.scheduled,
            scheduled_at__gte=now,
            # scheduled_at__lt=tomorrow,
        )

        next_appointment = upcoming_appointments.first()
        remaining_appointments = (
            upcoming_appointments[1:] if next_appointment else upcoming_appointments
        )

        ctx = {"request": request}

        return Response(
            {
                "next_appointment": AppointmentCreateSerializer(next_appointment, context=ctx).data,
                "upcoming_appointments": AppointmentCreateSerializer(
                    remaining_appointments, many=True, context=ctx
                ).data,
                "overdue_consultations": ConsultationSerializer(
                    consultations_qs.overdue.order_by("-created_at")[:3], many=True, context=ctx
                ).data,
            },
            status=status.HTTP_200_OK,
        )
