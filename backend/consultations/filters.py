import django_filters
from .models import Consultation, Appointment
from django.db.models import Exists, OuterRef
from django.utils import timezone
from datetime import timedelta

class ConsultationFilter(django_filters.FilterSet):
    # Custom boolean filter to check if closed_at is set
    is_closed = django_filters.BooleanFilter(
        field_name="closed_at",
        lookup_expr="isnull",
        exclude=True  # so is_closed=True means closed_at is NOT null
    )
    scheduled = django_filters.BooleanFilter(method='filter_scheduled')

    class Meta:
        model = Consultation
        fields = [
            "group",
            "beneficiary",
            "created_by",
            "owned_by",
            "closed_at",
        ]

    def filter_scheduled(self, queryset, name, value):
        from .models import AppointmentStatus
        cutoff = timezone.now() - timedelta(hours=2)
        has_future = Exists(
            Appointment.objects.filter(
                consultation=OuterRef('pk'),
                scheduled_at__gte=cutoff,
                status=AppointmentStatus.scheduled,
            )
        )
        if value is True:
            return queryset.filter(has_future)
        elif value is False:
            return queryset.filter(~has_future)
        return queryset


class AppointmentFilter(django_filters.FilterSet):
    future = django_filters.BooleanFilter(method='filter_future')

    class Meta:
        model = Appointment
        fields = {
            "consultation": ['exact',],
            "status": ['exact',],
            'scheduled_at': ['date__gte', 'date__lte'],
        }

    def filter_future(self, queryset, name, value):
        if value is True:
            return queryset.filter(scheduled_at__gte=timezone.now() - timedelta(hours=2))
        elif value is False:
            return queryset.filter(scheduled_at__lt=timezone.now() - timedelta(hours=2))
        return queryset
