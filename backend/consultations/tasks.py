import logging
from datetime import timedelta

import boto3
from asgiref.sync import async_to_sync
from botocore.exceptions import ClientError
from core.celery import app
from channels.layers import get_channel_layer
from constance import config
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from messaging.models import Message
from django_tenants.utils import get_tenant_model, tenant_context

from .assignments import AssignmentManager
from .models import (
    Appointment,
    AppointmentRecording,
    AppointmentStatus,
    Consultation,
    Participant,
    Request,
)

User = get_user_model()
logger = logging.getLogger(__name__)


@app.task
def handle_request(request_id):
    """
    Handle a consultation request by processing it based on the reason's assignment method.

    Args:
        request_id: The ID of the Request to process

    Returns:
        dict: Result of the processing with success status and details
    """
    request = Request.objects.get(id=request_id)

    with AssignmentManager(request) as assignment:
        assignment.handler.process()


@app.task
def handle_invites(appointment_id):
    appointment = Appointment.objects.get(pk=appointment_id)
    participants = Participant.objects.filter(is_invited=True, appointment=appointment)

    if appointment.status == AppointmentStatus.scheduled:
        if (
            appointment.previous_scheduled_at
            and appointment.previous_scheduled_at != appointment.scheduled_at
        ):
            template_system_name = "appointment_updated"
            participants = participants.filter(is_active=True)
        else:
            template_system_name = "invitation_to_appointment"
            participants = participants.filter(is_notified=False)
    elif appointment.status == AppointmentStatus.cancelled:
        template_system_name = "appointment_cancelled"
    else:
        "Do nothing"
        return

    for participant in participants:
        if not participant.is_active:
            template_system_name = "appointment_cancelled"

        # Don't notify creator
        if appointment.created_by == participant.user:
            continue

        message = Message.objects.create(
            communication_method=participant.user.communication_method,
            recipient_phone=participant.user.mobile_phone_number,
            recipient_email=participant.user.email,
            sent_to=participant.user,
            sent_by=appointment.created_by,
            template_system_name=template_system_name,
            content_type=ContentType.objects.get_for_model(participant),
            object_id=participant.pk,
        )
        participant.is_notified = True
        participant.save(update_fields=["is_notified"])


@app.task
def handle_reminders():
    now = timezone.now().replace(second=0, microsecond=0)
    TenantModel = get_tenant_model()
    for tenant in TenantModel.objects.exclude(schema_name='public'):
        with tenant_context(tenant):
            for reminder in ["appointment_first_reminder", "appointment_last_reminder"]:
                reminder_datetime = now + timedelta(minutes=int(getattr(config, reminder)))
                for appointment in Appointment.objects.filter(
                    scheduled_at=reminder_datetime, status=AppointmentStatus.scheduled
                ):
                    for participant in Participant.objects.filter(
                        appointment=appointment, is_active=True
                    ):
                        Message.objects.create(
                            sent_to=participant.user,
                            template_system_name=reminder,
                            content_type=ContentType.objects.get_for_model(participant),
                            object_id=participant.pk,
                        )


@app.task(
    bind=True,
    max_retries=settings.RECORDING_CHECK_MAX_RETRIES,
    default_retry_delay=settings.RECORDING_CHECK_RETRY_DELAY,
)
def check_recording_ready(self, recording_id):
    """
    Check if a recording file has been uploaded to S3 after recording stops.
    Initial delay is set via apply_async(countdown=120).
    Retries up to 4 times with 30s between each retry (~3.5 min total window).
    """
    from .models import Message as ConsultationMessage
    from .serializers import ConsultationMessageSerializer
    from .signals import get_users_to_notification_consultation

    try:
        recording = AppointmentRecording.objects.get(pk=recording_id)
    except AppointmentRecording.DoesNotExist:
        logger.error(f"AppointmentRecording {recording_id} not found")
        return

    # Already processed (duplicate task guard)
    if recording.message_id:
        return

    # Check if file exists in S3
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.LIVEKIT_S3_ENDPOINT_URL,
        aws_access_key_id=settings.LIVEKIT_S3_ACCESS_KEY,
        aws_secret_access_key=settings.LIVEKIT_S3_SECRET_KEY,
        region_name=settings.LIVEKIT_S3_REGION,
        config=boto3.session.Config(signature_version="s3v4"),
    )

    try:
        s3.head_object(Bucket=settings.LIVEKIT_S3_BUCKET_NAME, Key=recording.filepath)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
            logger.info(f"Recording {recording.filepath} not in S3 yet, retrying...")
            raise self.retry()
        raise

    # File confirmed in S3 — create message
    appointment = recording.appointment
    message = ConsultationMessage.objects.create(
        consultation=appointment.consultation,
        created_by=appointment.consultation.created_by,
        content=f"Recording: Appointment on {appointment.scheduled_at.strftime('%Y-%m-%d %H:%M')}",
        event="recording_available",
        recording_url=recording.filepath,
    )

    # Link message to recording row
    recording.message = message
    recording.save(update_fields=["message"])

    # WebSocket notification
    channel_layer = get_channel_layer()
    message_data = ConsultationMessageSerializer(message).data
    for user_pk in get_users_to_notification_consultation(appointment.consultation):
        async_to_sync(channel_layer.group_send)(
            f"user_{user_pk}",
            {
                "type": "message",
                "event": "message",
                "consultation_id": appointment.consultation.pk,
                "message_id": message.id,
                "state": "created",
                "data": message_data,
            },
        )

    logger.info(
        f"Recording message created for AppointmentRecording {recording_id}: message {message.id}"
    )


@app.task
def auto_delete_closed_consultations():
    TenantModel = get_tenant_model()
    for tenant in TenantModel.objects.exclude(schema_name='public'):
        with tenant_context(tenant):
            hours = int(config.consultation_auto_delete_hours)
            if hours == 0:
                logger.info("Auto-delete of closed consultations is disabled (0 hours)")
                return

            cutoff = timezone.now() - timedelta(hours=hours)
            qs = Consultation.objects.filter(closed_at__isnull=False, closed_at__lte=cutoff)
            count, _ = qs.delete()
            logger.info(f"Auto-deleted {count} closed consultation(s) older than {hours}h")
