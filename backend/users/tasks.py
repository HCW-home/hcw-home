import logging
from datetime import timedelta
from django_tenants.utils import get_tenant_model, tenant_context

from constance import config
from django.db.models import F, Q
from django.utils import timezone
from core.celery import app

from .models import User

logger = logging.getLogger(__name__)

@app.task
def auto_delete_temporary_users():
    TenantModel = get_tenant_model()
    for tenant in TenantModel.objects.exclude(schema_name='public'):
        with tenant_context(tenant):
            if not config.temporary_user_auto_delete:
                logger.info("Auto-delete of temporary users is disabled")
                return

            two_hours_ago = timezone.now() - timedelta(hours=2)
            one_hour_ago = timezone.now() - timedelta(hours=1)
            users = User.objects.filter(
                temporary=True,
                date_joined__lt=one_hour_ago
            ).exclude(
                appointments_participating__status="scheduled",
                appointments_participating__scheduled_at__gt=two_hours_ago,
            ).exclude(
                Q(consultation__isnull=False) |
                Q(consultation_created__isnull=False) |
                Q(consultation_owned__isnull=False)
            )
            count, _ = users.delete()
            logger.info(f"Auto-deleted {count} temporary user(s) with no future appointments and no consultations")
