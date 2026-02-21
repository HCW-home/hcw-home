from django.contrib.auth import get_user_model
from django_filters.rest_framework import BooleanFilter, FilterSet

User = get_user_model()


class UserFilter(FilterSet):
    has_group_permissions = BooleanFilter(method="filter_has_group_permissions")
    is_practitioner = BooleanFilter(field_name="is_practitioner")

    class Meta:
        model = User
        fields = {
            "temporary": ["exact"],
        }

    def filter_has_group_permissions(self, queryset, name, value):
        if value is True:
            return queryset.filter(groups__isnull=False).distinct()
        elif value is False:
            return queryset.filter(groups__isnull=True)
        return queryset
