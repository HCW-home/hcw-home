from typing import List, Tuple, Union

from allauth.socialaccount.models import SocialApp, SocialToken, SocialAccount
from constance.admin import Config, ConstanceAdmin
from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils.translation import ngettext_lazy
from fcm_django.admin import DeviceAdmin
from fcm_django.models import FCMDevice, FirebaseResponseDict, fcm_error_list
from firebase_admin.messaging import (
    ErrorInfo,
    Message,
    Notification,
    SendResponse,
    TopicManagementResponse,
)
from import_export.admin import ImportExportModelAdmin
from modeltranslation.admin import TabbedTranslationAdmin
from unfold.admin import ModelAdmin, StackedInline, TabularInline
from unfold.contrib.forms.widgets import WysiwygWidget
from unfold.contrib.import_export.forms import (
    ExportForm,
    ImportForm,
    SelectableFieldsExportForm,
)
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm
from unfold.widgets import UnfoldAdminColorInputWidget

from .models import (
    FCMDeviceOverride,
    HealthMetric,
    Language,
    Organisation,
    Speciality,
    Term,
    User,
    WebPushSubscription,
)

admin.site.unregister(Group)


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
    pass

admin.site.unregister(SocialApp)
admin.site.register(SocialApp, ModelAdmin)

admin.site.unregister(SocialToken)
admin.site.register(SocialToken, ModelAdmin)

admin.site.unregister(SocialAccount)
admin.site.register(SocialAccount, ModelAdmin)



@admin.register(Term)
class TermAdmin(ModelAdmin, TabbedTranslationAdmin):
    formfield_overrides = {
        models.TextField: {
            "widget": WysiwygWidget,
        }
    }


class UserAdmin(BaseUserAdmin, ModelAdmin, ImportExportModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm
    import_form_class = ImportForm
    export_form_class = ExportForm
    list_editable = ["is_active"]
    ordering = ["email"]
    readonly_fields = ("last_login", "date_joined")
    search_fields = ("first_name", "last_name", "email")
    # export_form_class = SelectableFieldsExportForm

    list_display = [
        "email",
        "first_name",
        "last_name",
        "is_active",
        "is_practitioner",
        "temporary",
        "timezone",
        "languages_display",
        "specialities_display",
        "get_groups",
    ]

    list_filter = BaseUserAdmin.list_filter + (
        "languages",
        "specialities",
        "groups",
    )
    filter_horizontal = BaseUserAdmin.filter_horizontal + ("languages", "specialities")

    fieldsets = (
        (
            _("Personal info"),
            {"fields": ("email", "first_name", "last_name", "password")},
        ),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "is_practitioner",
                    "temporary",
                    "groups",
                    # "user_permissions",
                ),
            },
        ),
        (
            "Additional Info",
            {
                "fields": (
                    "location",
                    "app_preferences",
                    "mobile_phone_number",
                    "communication_method",
                    "timezone",
                    "preferred_language",
                    "languages",
                    "specialities",
                    "main_organisation",
                    "organisations",
                    "picture",
                    "accepted_term",
                )
            },
        ),
        (
            "Authentication",
            {"fields": ("one_time_auth_token", "verification_code",
                        "is_first_login", "verification_code_created_at", "verification_attempts")},
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "usable_password", "password1", "password2"),
            },
        ),
    )

    @admin.display(description="Groups")
    def get_groups(self, obj):
        if obj.groups.exists():
            return ", ".join([g.name for g in obj.groups.all()])
        return "-"

    def languages_display(self, obj):
        return ", ".join([lang.name for lang in obj.languages.all()[:3]]) + (
            "..." if obj.languages.count() > 3 else ""
        )

    languages_display.short_description = "Languages"

    def specialities_display(self, obj):
        return ", ".join([spec.name for spec in obj.specialities.all()[:3]]) + (
            "..." if obj.specialities.count() > 3 else ""
        )

    specialities_display.short_description = "Specialities"


admin.site.register(User, UserAdmin)


class DeviceAdmin(ModelAdmin):
    list_display = (
        "__str__",
        "device_id",
        "name",
        "type",
        "user",
        "active",
        "date_created",
    )
    list_filter = (
        "active",
        "type",
    )
    actions = (
        "send_message",
        "send_bulk_message",
        "subscribe_to_topic",
        "bulk_subscribe_to_topic",
        "unsubscribe_to_topic",
        "bulk_unsubscribe_to_topic",
        "send_topic_message",
        "enable",
        "disable",
    )
    raw_id_fields = ("user",)
    list_select_related = ("user",)

    # def get_search_fields(self, request):
    #     if hasattr(User, "USERNAME_FIELD"):
    #         return "name", "device_id", f"user__{User.USERNAME_FIELD}"
    #     else:
    #         return "name", "device_id"

    def _send_deactivated_message(
        self,
        request,
        response: Union[
            FirebaseResponseDict,
            List[FirebaseResponseDict],
            List[Tuple[SendResponse, str]],
        ],
        total_failure: int,
        is_topic: bool,
    ):
        if total_failure == 0:
            return
        if is_topic:
            message = ngettext_lazy(
                "A device failed to un/subscribe to topic. %(count)d device was "
                "marked as inactive.",
                "Some devices failed to un/subscribe to topic. %(count)d devices "
                "were marked as inactive.",
                total_failure,
            )
        else:
            message = ngettext_lazy(
                "A message failed to send. %(count)d device was marked as inactive.",
                "Some messages failed to send. %(count)d devices were marked as "
                "inactive.",
                total_failure,
            )
        self.message_user(
            request,
            message % {"count": total_failure},
            level=messages.WARNING,
        )

        def _get_to_str_obj(obj):
            if isinstance(obj, SendResponse):
                return obj.exception
            elif isinstance(obj, TopicManagementResponse):
                return obj.errors
            return obj

        def _print_responses(_response):
            __error_list = fcm_error_list + [ErrorInfo]
            # TODO Aggregate error response text. Each firebase error
            #  has multiple response texts too
            [
                self.message_user(
                    request,
                    (
                        _("%(response)s (Registration ID/Tokens: %(reg_id)s)")
                        % {"response": _get_to_str_obj(x), "reg_id": reg_id}
                    ),
                    level=messages.WARNING,
                )
                for x, reg_id in _response
                if type(_get_to_str_obj(x)) in __error_list
            ]

        if isinstance(response, list):
            # Our custom list of single responses
            _print_responses(response)
        elif isinstance(response, FirebaseResponseDict):
            # technically, type should be: FirebaseResponseDict not just dict
            _print_responses(
                zip(
                    response.response.responses,
                    response.deactivated_registration_ids,
                ),
            )
        else:
            raise NotImplementedError

    def send_messages(self, request, queryset, bulk=False):
        """
        Provides error handling for DeviceAdmin send_message and
        send_bulk_message methods.
        """
        total_failure = 0
        single_responses: List[Tuple[SendResponse, str]] = []

        for device in queryset:
            device: "FCMDevice"
            if bulk:
                response = queryset.send_message(
                    Message(
                        notification=Notification(
                            title="Test notification", body="Test bulk notification"
                        )
                    )
                )
                total_failure = len(response.deactivated_registration_ids)
                return self._send_deactivated_message(
                    request, response, total_failure, False
                )
            else:
                response = device.send_message(
                    Message(
                        notification=Notification(
                            title="Test notification", body="Test single notification"
                        )
                    )
                )
                single_responses.append((response, device.registration_id))
                if type(response) != SendResponse:
                    total_failure += 1

        self._send_deactivated_message(request, single_responses, total_failure, False)

    def send_message(self, request, queryset):
        self.send_messages(request, queryset)

    send_message.short_description = _("Send test notification")

    def send_bulk_message(self, request, queryset):
        self.send_messages(request, queryset, True)

    send_bulk_message.short_description = _("Send test notification in bulk")

    def handle_topic_subscription(
        self, request, queryset, should_subscribe: bool, bulk: bool = False
    ):
        """
        Provides error handling for DeviceAdmin bulk_un/subscribe_to_topic and
        un/subscribe_to_topic methods.
        """
        total_failure = 0
        single_responses = []

        for device in queryset:
            device: "FCMDevice"
            if bulk:
                response: "FirebaseResponseDict" = queryset.handle_topic_subscription(
                    should_subscribe,
                    "test-topic",
                )
                total_failure = response.response.failure_count
                single_responses = [
                    (x, response.registration_ids_sent[x.index])
                    for x in response.response.errors
                ]
                break
            else:
                response = device.handle_topic_subscription(
                    should_subscribe,
                    "test-topic",
                )
                single_responses.append(
                    (
                        response.response.errors[0]
                        if len(response.response.errors) > 0
                        else "Success",
                        device.registration_id,
                    )
                )
                total_failure += len(response.deactivated_registration_ids)

        self._send_deactivated_message(request, single_responses, total_failure, True)

    def subscribe_to_topic(self, request, queryset):
        self.handle_topic_subscription(request, queryset, True)

    subscribe_to_topic.short_description = _("Subscribe to test topic")

    def bulk_subscribe_to_topic(self, request, queryset):
        self.handle_topic_subscription(request, queryset, True, True)

    bulk_subscribe_to_topic.short_description = _("Subscribe to test topic in bulk")

    def unsubscribe_to_topic(self, request, queryset):
        self.handle_topic_subscription(request, queryset, False)

    unsubscribe_to_topic.short_description = _("Unsubscribe to test topic")

    def bulk_unsubscribe_to_topic(self, request, queryset):
        self.handle_topic_subscription(request, queryset, False, True)

    bulk_unsubscribe_to_topic.short_description = _("Unsubscribe to test topic in bulk")

    def handle_send_topic_message(self, request, queryset):
        FCMDevice.send_topic_message(
            Message(
                notification=Notification(
                    title="Test notification", body="Test single notification"
                )
            ),
            "test-topic",
        )

    def send_topic_message(self, request, queryset):
        self.handle_send_topic_message(request, queryset)

    send_topic_message.short_description = _("Send message test topic")

    def enable(self, request, queryset):
        queryset.update(active=True)

    enable.short_description = _("Enable selected devices")

    def disable(self, request, queryset):
        queryset.update(active=False)

    disable.short_description = _("Disable selected devices")


admin.site.unregister(FCMDevice)
admin.site.register(FCMDeviceOverride, DeviceAdmin)


@admin.register(WebPushSubscription)
class WebPushSubscriptionAdmin(ModelAdmin):
    list_display = ["user", "endpoint_short", "browser", "is_active", "created_at"]
    list_filter = ["is_active", "browser"]
    search_fields = ["user__email", "endpoint"]
    readonly_fields = ["created_at", "updated_at"]

    def endpoint_short(self, obj):
        return obj.endpoint[:60] + "..."

    endpoint_short.short_description = "Endpoint"


@admin.register(Language)
class LanguageAdmin(ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]
    ordering = ["name"]


@admin.register(Speciality)
class SpecialityAdmin(ModelAdmin, TabbedTranslationAdmin):
    list_display = ["name"]
    search_fields = ["name"]
    ordering = ["name"]


@admin.register(Organisation)
class OrganisationAdmin(ModelAdmin):
    formfield_overrides = {
        models.TextField: {
            "widget": WysiwygWidget,
        }
    }

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change, **kwargs)
        form.base_fields["primary_color_patient"].widget = UnfoldAdminColorInputWidget()
        form.base_fields["primary_color_practitioner"].widget = UnfoldAdminColorInputWidget()
        return form


@admin.register(HealthMetric)
class HealthMetricAdmin(ModelAdmin):
    date_hierarchy = "measured_at"
    ordering = ["-measured_at"]


from django.contrib import admin
from django_celery_beat.admin import ClockedScheduleAdmin as BaseClockedScheduleAdmin
from django_celery_beat.admin import CrontabScheduleAdmin as BaseCrontabScheduleAdmin
from django_celery_beat.admin import PeriodicTaskAdmin as BasePeriodicTaskAdmin
from django_celery_beat.admin import PeriodicTaskForm, TaskSelectWidget
from django_celery_beat.models import (
    ClockedSchedule,
    CrontabSchedule,
    IntervalSchedule,
    PeriodicTask,
    SolarSchedule,
)
from unfold.admin import ModelAdmin
from unfold.widgets import UnfoldAdminSelectWidget, UnfoldAdminTextInputWidget

admin.site.unregister(PeriodicTask)
admin.site.unregister(IntervalSchedule)
admin.site.unregister(CrontabSchedule)
admin.site.unregister(SolarSchedule)
admin.site.unregister(ClockedSchedule)


class UnfoldTaskSelectWidget(UnfoldAdminSelectWidget, TaskSelectWidget):
    pass


class UnfoldPeriodicTaskForm(PeriodicTaskForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["task"].widget = UnfoldAdminTextInputWidget()
        self.fields["regtask"].widget = UnfoldTaskSelectWidget()


@admin.register(PeriodicTask)
class PeriodicTaskAdmin(BasePeriodicTaskAdmin, ModelAdmin):
    form = UnfoldPeriodicTaskForm


@admin.register(IntervalSchedule)
class IntervalScheduleAdmin(ModelAdmin):
    pass


@admin.register(CrontabSchedule)
class CrontabScheduleAdmin(BaseCrontabScheduleAdmin, ModelAdmin):
    pass


@admin.register(SolarSchedule)
class SolarScheduleAdmin(ModelAdmin):
    pass


@admin.register(ClockedSchedule)
class ClockedScheduleAdmin(BaseClockedScheduleAdmin, ModelAdmin):
    pass
