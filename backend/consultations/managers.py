from django.db import models
from django.db.models import Q


class ConsultationQuerySet(models.QuerySet):
    """Custom QuerySet for Consultation model"""

    @property
    def active(self):
        return self.filter(closed_at__isnull=True)


class ConsultationManager(models.Manager):
    """Custom Manager for Consultation model"""

    def get_queryset(self):
        return ConsultationQuerySet(self.model, using=self._db)

    def accessible_by(self, user):
        return self.filter(
            Q(owned_by=user) | Q(created_by=user) | Q(group__users=user),
        ).distinct()
