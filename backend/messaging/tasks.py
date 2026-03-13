import io
import logging
import traceback
from datetime import timedelta
from core.celery import app

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from modeltranslation.utils import get_translation_fields

from . import providers
from .models import (
    Message,
    MessageStatus,
    MessagingProvider,
    Template,
    TemplateValidation,
    TemplateValidationStatus,
)

# Set up logging
logger = logging.getLogger(__name__)


@app.task(bind=True)
def send_message(self, message_id):
    """
    Celery task to send message by trying providers in priority order

    Args:
        message_id (int): The ID of the message to send
    """
    # Get message and maps to celery task and reset any status
    message = Message.objects.get(id=message_id)
    message.status = MessageStatus.sending
    message.celery_task_id = self.request.id
    message.error_message = None
    message.save()

    # Get all active providers for this communication method, ordered by priority
    messaging_providers = MessagingProvider.objects.filter(
        communication_method=message.validated_communication_method, is_active=True
    ).order_by("priority", "id")

    if not messaging_providers.exists():
        message.status = MessageStatus.failed
        message.error_message = f"Unable to find active communication for {message.validated_communication_method}"
        message.save()
        return

    logger.info(
        f"Found {messaging_providers.count()} providers for {message.validated_communication_method}"
    )

    # Try each provider in order
    for messaging_provider in messaging_providers:
        logger.info(
            f"Trying provider: {messaging_provider.name} (priority: {messaging_provider.priority})"
        )

        try:
            # Get the provider class
            messaging_provider.instance.send(message)
            message.status = MessageStatus.sent
            message.save()
            return

        except Exception as e:
            error_msg = f"Exception with provider {messaging_provider.name}: {str(e)}\n"
            message.task_logs += error_msg
            message.save()
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            continue

    # All providers failed
    message.task_logs += f"All providers failed for communication method: {message.communication_method}\n"
    message.status = MessageStatus.failed
    message.save()


# class TaskLogCapture:
#     """Context manager to capture logs during task execution"""

#     def __init__(self):
#         self.log_capture = io.StringIO()
#         self.handler = logging.StreamHandler(self.log_capture)
#         self.handler.setLevel(logging.INFO)
#         formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
#         self.handler.setFormatter(formatter)

#     def __enter__(self):
#         # Add handler to capture logs
#         logger.addHandler(self.handler)
#         return self

#     def __exit__(self, exc_type, exc_val, exc_tb):
#         # Remove handler and get logs
#         logger.removeHandler(self.handler)
#         self.handler.close()

#     def get_logs(self):
#         return self.log_capture.getvalue()


@app.task
def cleanup_old_message_logs(days=30):
    """
    Periodic task to clean up old message logs to prevent database bloat

    Removes logs older than 30 days
    """
    logger.info("Starting cleanup_old_message_logs task")

    cutoff_time = timezone.now() - timedelta(days=days)

    # Clear logs from old messages
    updated_count = Message.objects.filter(created_at__lt=cutoff_time).update(
        task_logs="", task_traceback=""
    )

    logger.info(f"Cleaned up logs from {updated_count} old messages")
    return {"cleaned_count": updated_count}


@app.task
def template_messaging_provider_task(self, template_validation_id, action):
    """
    Celery task to submit or check a template validation with the messaging provider.

    Args:
        template_validation_id: ID of the TemplateValidation record
        action: Provider method to call ('validate_template' or 'check_template_validation')
    """
    try:
        validation = TemplateValidation.objects.select_related(
            "messaging_provider"
        ).get(pk=template_validation_id)
    except TemplateValidation.DoesNotExist:
        logger.error(f"TemplateValidation {template_validation_id} not found")
        return

    validation.celery_task_id = self.request.id
    validation.save(update_fields=["celery_task_id"])

    provider_instance = validation.messaging_provider.instance
    method = getattr(provider_instance, action, None)

    if not method:
        validation.task_logs += f"Provider {validation.messaging_provider.name} does not support '{action}'\n"
        validation.status = TemplateValidationStatus.failed
        validation.save(update_fields=["task_logs", "status"])
        return

    try:
        method(validation)

        # Store content hash after successful validation submission
        if action == "validate_template":
            validation.content_hash = validation.compute_content_hash()
            validation.save(update_fields=["content_hash"])

        validation.task_logs += f"Action '{action}' completed successfully\n"
        validation.save(update_fields=["task_logs"])

    except Exception as e:
        validation.task_logs += f"Action '{action}' failed: {e}\n"
        validation.status = TemplateValidationStatus.failed
        validation.save(update_fields=["task_logs", "status"])
        logger.exception(
            f"template_messaging_provider_task failed for validation {template_validation_id}"
        )
