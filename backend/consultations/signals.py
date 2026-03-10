from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver
from django.utils import timezone
from messaging.models import Message as NotificationMessage
from users.services import user_online_service

from .models import (
    Appointment,
    AppointmentStatus,
    Consultation,
    Message,
    Participant,
    Request,
    RequestStatus,
)
from .serializers import ConsultationMessageSerializer
from .tasks import handle_invites

User = get_user_model()


def get_users_to_notification_consultation(consultation: Consultation):
    # Collect users to notify
    users_to_notify_pks = set()

    # Add owned_by user
    if consultation.owned_by:
        users_to_notify_pks.add(consultation.owned_by.pk)

    # Add creator
    if consultation.created_by:
        users_to_notify_pks.add(consultation.created_by.pk)

    # Add beneficiary user
    if consultation.beneficiary:
        users_to_notify_pks.add(consultation.beneficiary.pk)

    # Add users from group (queue)
    if consultation.group:
        for user in consultation.group.users.all():
            users_to_notify_pks.add(user.pk)

    return users_to_notify_pks


@receiver(post_save, sender=Consultation)
def consultation_saved(sender, instance: Consultation, created, **kwargs):
    """
    Whenever a Consultation is created/updated, broadcast it over Channels.
    """
    channel_layer = get_channel_layer()

    # Send notifications to each user
    for user_pk in get_users_to_notification_consultation(instance):
        async_to_sync(channel_layer.group_send)(
            f"user_{user_pk}",
            {
                "type": "consultation",
                "consultation_id": instance.pk,
                "state": "created" if created else "updated",
            },
        )


@receiver(post_save, sender=Message)
def message_saved(sender, instance: Message, created, **kwargs):
    """
    Whenever a Message is saved, broadcast it over Channels and send external notifications to offline users.
    """
    channel_layer = get_channel_layer()

    # Send notifications to each user
    for user_pk in get_users_to_notification_consultation(instance.consultation):
        # Send WebSocket notification (including to the message creator for multi-tab sync)
        async_to_sync(channel_layer.group_send)(
            f"user_{user_pk}",
            {
                "type": "message",
                "consultation_id": instance.consultation.pk,
                "message_id": instance.pk,
                "data": ConsultationMessageSerializer(instance).data,
                "state": "created" if created else "updated",
            },
        )

        # Skip external notifications for the message creator
        if instance.created_by and instance.created_by.pk == user_pk:
            continue

        # Send external notification if user is offline and message is newly created
        if created and not user_online_service.is_user_online(user_pk):
            user_to_notify = User.objects.get(pk=user_pk)

            # Skip if we already sent a notification since the user's last login
            # (avoid spamming offline users with repeated notifications)
            if (
                user_to_notify.last_login
                and user_to_notify.last_notification
                and user_to_notify.last_notification > user_to_notify.last_login
            ):
                continue

            user_to_notify.last_notification = timezone.now()
            user_to_notify.save(update_fields=["last_notification"])

            # Create notification message
            NotificationMessage.objects.create(
                template_system_name="new_message_notification",
                sent_to=user_to_notify,
                sent_by=instance.created_by,
                content_type=ContentType.objects.get_for_model(instance),
                object_id=instance.pk,
            )


@receiver(post_save, sender=Appointment)
def appointment_saved(sender, instance: Appointment, created, **kwargs):
    """
    Whenever an Appointment is created/updated, broadcast it over Channels
    to consultation users and appointment participants.
    """
    channel_layer = get_channel_layer()

    users_to_notify = set()

    # Add consultation users
    if instance.consultation:
        users_to_notify.update(
            get_users_to_notification_consultation(instance.consultation)
        )

    # Add appointment participants
    for participant in instance.participant_set.filter(
        is_active=True, user__isnull=False
    ):
        users_to_notify.add(participant.user.pk)

    consultation_pk = instance.consultation.pk if instance.consultation else None

    for user_pk in users_to_notify:
        async_to_sync(channel_layer.group_send)(
            f"user_{user_pk}",
            {
                "type": "appointment",
                "consultation_id": consultation_pk,
                "appointment_id": instance.pk,
                "state": "created" if created else "updated",
            },
        )


@receiver(post_delete, sender=Consultation)
def consultation_deleted(sender, instance, **kwargs):
    channel_layer = get_channel_layer()
    for user_pk in get_users_to_notification_consultation(instance):
        async_to_sync(channel_layer.group_send)(
            f"user_{user_pk}",
            {
                "type": "consultation",
                "consultation_id": instance.pk,
                "state": "deleted",
            },
        )


@receiver(post_save, sender=Request)
def request_saved(sender, instance, created, **kwargs):
    """
    Whenever a Request is created, trigger the celery task to process it.
    Only trigger for newly created requests with REQUESTED status.
    """
    if created and instance.status == RequestStatus.requested:
        try:
            # Import the task here to avoid circular imports
            from .tasks import handle_request

            # Trigger the celery task asynchronously
            handle_request.delay(instance.id)
        except Exception as e:
            # Log the error but don't block the request creation
            import logging

            logger = logging.getLogger(__name__)
            logger.error(
                f"Failed to trigger celery task for request {instance.id}: {str(e)}"
            )
            # For debugging: temporarily disable to see if this is the cause
            pass


@receiver(post_save, sender=Appointment)
def send_appointment_invites(sender, instance: Appointment, created, **kwargs):
    """
    Prepare invite sending over celery task.
    """

    if instance.status in [AppointmentStatus.scheduled, AppointmentStatus.cancelled]:
        transaction.on_commit(lambda: handle_invites.delay(instance.pk))


@receiver(pre_save, sender=Message)
def mark_message_edited(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Message.objects.get(pk=instance.pk)
            if old.content != instance.content or old.attachment != instance.attachment:
                instance.is_edited = True
        except Message.DoesNotExist:
            pass


@receiver(pre_save, sender=Appointment)
def appointment_previous_scheduled_at(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Appointment.objects.get(pk=instance.pk)
            if old.scheduled_at != instance.scheduled_at:
                instance.previous_scheduled_at = old.scheduled_at
            else:
                instance.previous_scheduled_at = None
        except Appointment.DoesNotExist:
            pass


@receiver(post_save, sender=Participant)
def participant_cancelling(sender, instance: Participant, **kwargs):
    if not instance.is_active:
        NotificationMessage.objects.create(
            template_system_name="appointment_cancelled",
            sent_to=instance.user,
            content_type=ContentType.objects.get_for_model(instance),
            object_id=instance.pk,
        )


@receiver(pre_save, sender=Consultation)
def track_beneficiary_change(sender, instance: Consultation, **kwargs):
    """
    Track if beneficiary is being added or changed on a consultation.
    Store the old beneficiary ID for comparison in post_save.
    """
    if instance.pk:
        try:
            old_consultation = Consultation.objects.get(pk=instance.pk)
            instance._old_beneficiary_id = old_consultation.beneficiary_id
        except Consultation.DoesNotExist:
            instance._old_beneficiary_id = None
    else:
        instance._old_beneficiary_id = None


@receiver(post_save, sender=Consultation)
def notify_beneficiary_assigned(sender, instance: Consultation, created, **kwargs):
    """
    Send notification to beneficiary when they are assigned to a consultation.
    Only send if the consultation is visible by the patient.
    """
    # Check if beneficiary was added or changed
    old_beneficiary_id = getattr(instance, '_old_beneficiary_id', None)
    new_beneficiary_id = instance.beneficiary_id

    # Only notify if:
    # 1. A beneficiary is set
    # 2. The beneficiary was just added (created=True and beneficiary exists) OR
    #    the beneficiary was changed (old_beneficiary_id != new_beneficiary_id)
    # 3. The consultation is visible by the patient
    should_notify = (
        new_beneficiary_id and
        instance.visible_by_patient and
        (
            (created and new_beneficiary_id) or
            (not created and old_beneficiary_id != new_beneficiary_id)
        )
    )

    if should_notify:
        # Create notification for the beneficiary
        NotificationMessage.objects.create(
            template_system_name="consultation_assigned",
            sent_to=instance.beneficiary,
            sent_by=instance.created_by,
            content_type=ContentType.objects.get_for_model(instance),
            object_id=instance.pk,
        )
