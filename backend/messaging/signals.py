from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import (
    Message,
    MessageStatus,
    Template,
    TemplateValidation,
    TemplateValidationStatus,
)
from .tasks import send_message


@receiver(post_save, sender=Message)
def notify_message_recipient(sender, instance: Message, created, **kwargs):
    """
    Send websocket notification to the message recipient when a message is created
    """
    if created and instance.sent_to and instance.in_notification:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{instance.sent_to.id}",
            {
                "type": "notification",
                "id": instance.id,
                "render_content_html": str(instance.render_content_html or ""),
                "render_subject": str(instance.render_subject or ""),
                "access_link": str(instance.access_link or ""),
                "action_label": str(instance.action_label or ""),
                "action": str(instance.action_label or ""),
                "created_at": instance.created_at.isoformat()
                if instance.created_at
                else None,
            },
        )

    if created and instance.sent_to:
        transaction.on_commit(lambda: send_message.delay(instance.pk))


@receiver(post_save, sender=Template)
def mark_validations_outdated(sender, instance: Template, **kwargs):
    """Mark related TemplateValidation entries as outdated when template content changes."""
    validations = TemplateValidation.objects.filter(
        event_type=instance.event_type,
        status__in=[
            TemplateValidationStatus.validated,
            TemplateValidationStatus.pending,
        ],
    )
    for validation in validations:
        if validation.is_outdated:
            validation.status = TemplateValidationStatus.outdated
            validation.save(update_fields=["status"])
