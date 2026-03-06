import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

import celery
import requests
from celery import chain, group, shared_task
from constance import config
from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone
from django_celery_results.models import TaskResult

from . import models
from .models import User

logger = logging.getLogger(__name__)


app = celery.Celery("tasks", broker="redis://localhost")
app.config_from_object("django.conf:settings", namespace="CELERY")


@shared_task
def auto_delete_temporary_users():
    if not config.temporary_user_auto_delete:
        logger.info("Auto-delete of temporary users is disabled")
        return

    two_hours_ago = timezone.now() - timedelta(hours=2)
    users = User.objects.filter(
        temporary=True
    ).exclude(
        appointments_participating__status="scheduled",
        appointments_participating__scheduled_at__gt=two_hours_ago,
    ).exclude(
        Q(consultation_set__isnull=False) |
        Q(consultation_created__isnull=False) |
        Q(consultation_owned__isnull=False)
    )
    count, _ = users.delete()
    logger.info(f"Auto-deleted {count} temporary user(s) with no future appointments and no consultations")
