import logging

logger = logging.getLogger(__name__)
import json
from typing import DefaultDict

from django.conf import settings
from django.contrib import admin, messages
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.functional import cached_property
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from import_export.admin import ImportExportModelAdmin
from modeltranslation.admin import TabbedTranslationAdmin

# Register your models here.
from unfold.admin import ModelAdmin, TabularInline
from unfold.contrib.import_export.forms import ExportForm, ImportForm
from unfold.decorators import action, display

from . import providers
from .forms import TemplateForm
from .models import (
    CommunicationMethod,
    Message,
    MessageStatus,
    MessagingProvider,
    Template,
    TemplateValidation,
    TemplateValidationStatus,
)
from .tasks import send_message, template_messaging_provider_task
from .template import DEFAULT_NOTIFICATION_MESSAGES, NOTIFICATION_CHOICES

# admin.site.register(MessagingProvider, ModelAdmin)


@admin.register(MessagingProvider)
class MessagingProviderAdmin(ModelAdmin):
    list_display = ["name", "get_from", "priority", "is_active", "communication_method"]
    readonly_fields = ["communication_method"]

    fieldsets = [
        ("Basic information", {"fields": ["name", "priority", "is_active"]}),
        (
            "Authentication and configuration",
            {
                "fields": [
                    "api_key",
                    "auth_token",
                    "account_sid",
                    "client_id",
                    "client_secret",
                    "application_key",
                    "application_secret",
                    "consumer_key",
                    "service_name",
                    "from_phone",
                    "from_email",
                    "sender_id",
                ]
            },
        ),
        (
            "Phone prefex filtering",
            {
                "fields": ["included_prefixes", "excluded_prefixes"],
                "description": "Configure which phone prefixes this provider should handle. Separate multiple prefixes with commas (e.g. +33, +41, +1). Leave included_prefixes empty to allow all except excluded ones.",
            },
        ),
    ]

    # Use compressed_fields for conditional display
    compressed_fields = True

    actions = ["test_provider"]

    @action(
        description=_("Test connection wiht selected providers"),
    )
    def test_provider(self, request, queryset):
        for provider in queryset.all():
            try:
                provider.instance.test_connection()
                messages.success(request, _(f"Test succesfull: {provider}"))
            except Exception as e:
                messages.error(request, _(f"Test unsuccesfull: {provider}, {e}"))

    @display(description="Send from")
    def get_from(self, obj):
        return obj.from_phone or obj.from_email or "-"

    @cached_property
    def conditional_fields(self):
        field_set = DefaultDict(list)
        for provider, class_provider in providers.MAIN_CLASSES.items():
            for field in class_provider.required_fields:
                field_set[field].append(provider)

        return {
            key: "name == '" + "' || name == '".join(values) + "'"
            for key, values in field_set.items()
        }


@admin.register(Message)
class MessageAdmin(ModelAdmin):
    list_display = [
        "recipient",
        "display_status",
        "communication_method",
        "sent_by",
        "created_at",
        "display_template_is_valid",
    ]
    list_filter = ["communication_method", "status", "created_at", "provider_name"]
    search_fields = [
        "content",
        "recipient_phone",
        "recipient_email",
        "sent_by__email",
        "celery_task_id",
    ]
    readonly_fields = [
        "display_render_subject",
        "display_render_content",
        "display_render_content_html",
        "display_render_content_sms",
        "display_template_is_valid",
        "status",
        "sent_at",
        "delivered_at",
        "read_at",
        "failed_at",
        "error_message",
        "provider_name",
        "external_message_id",
        "celery_task_id",
        "task_logs",
        "created_at",
        "updated_at",
        "action",
        "action_label",
        "access_link",
    ]

    fieldsets = [
        (
            _("Sender & Recipient"),
            {
                "fields": [
                    "sent_by",
                    "sent_to",
                    "recipient_email",
                    "recipient_phone",
                    "communication_method",
                ],
            },
        ),
        (
            _("Content"),
            {
                "fields": [
                    "template_system_name",
                    "display_render_subject",
                    "display_render_content",
                    "display_render_content_html",
                    "display_render_content_sms",
                    "display_template_is_valid",
                    "subject",
                    "content",
                    "content_html",
                ],
            },
        ),
        (
            _("Delivery status"),
            {
                "fields": [
                    "status",
                    "sent_at",
                    "delivered_at",
                    "read_at",
                    "failed_at",
                    "error_message",
                ],
            },
        ),
        (
            _("Link & Action"),
            {
                "fields": [
                    "action",
                    "action_label",
                    "access_link",
                    "content_type",
                    "object_id",
                    "additionnal_link_args",
                    "in_notification",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            _("Technical"),
            {
                "fields": [
                    "provider_name",
                    "external_message_id",
                    "celery_task_id",
                    "task_logs",
                    "created_at",
                    "updated_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]

    actions = ["send_message"]

    @display(
        description=_("Status"),
        label={
            MessageStatus.failed: "danger",
            MessageStatus.sent: "info",
            MessageStatus.pending: "dark",
            MessageStatus.delivered: "info",
            MessageStatus.read: "success",
        },
    )
    def display_status(self, instance):
        return instance.status

    @display(
        description=_("Rendering is valid"),
        label={
            "False": "danger",
            "True": "success",
        },
    )
    def display_template_is_valid(self, instance):
        return str(instance.template_is_valid)

    def send_message(self, request, queryset):
        """Resend failed messages via Celery"""

        for message in queryset.all():
            send_message.delay(message.pk)

    @display(description=_("Rendered subject"))
    def display_render_subject(self, instance):
        try:
            return instance.render_subject
        except Exception as e:
            return f"Unable to render: {e}"

    @display(description=_("Rendered text content"))
    def display_render_content(self, instance):
        try:
            return instance.render_content
        except Exception as e:
            return f"Unable to render: {e}"

    @display(description=_("Rendered text content SMS"))
    def display_render_content_sms(self, instance):
        try:
            return instance.render_content_sms
        except Exception as e:
            return f"Unable to render: {e}"

    @display(description=_("Rendered HTML content"))
    def display_render_content_html(self, instance):
        try:
            return format_html(instance.render_content_html)
        except Exception as e:
            return f"Unable to render: {e}"

    send_message.short_description = "Send or resend message"


@admin.register(Template)
class TemplateAdmin(ModelAdmin, TabbedTranslationAdmin, ImportExportModelAdmin):
    list_display = [
        "event_type",
        "communication_method",
        "is_active",
        "created_at",
        "variables",
        "example",
    ]
    list_filter = ["communication_method", "is_active", "created_at"]
    search_fields = ["event_type"]
    readonly_fields = ["created_at", "updated_at"]
    form = TemplateForm
    import_form_class = ImportForm
    export_form_class = ExportForm
    list_editable = ["is_active"]

    class Media:
        js = ("messaging/js/template_prefill.js",)

    def get_urls(self):
        from django.http import JsonResponse
        from django.urls import path

        def template_defaults_view(request):
            from django.utils import translation

            languages = [lang_code for lang_code, _ in settings.LANGUAGES]
            defaults = {}
            for key, v in DEFAULT_NOTIFICATION_MESSAGES.items():
                entry = {
                    "action_label": str(v.get("action_label", "")),
                }
                # Translated fields: render in each language
                for lang in languages:
                    with translation.override(lang):
                        entry[f"template_subject_{lang}"] = str(
                            v.get("template_subject", "")
                        )
                        entry[f"template_content_{lang}"] = str(
                            v.get("template_content", "")
                        )
                        entry[f"template_content_html_{lang}"] = str(
                            v.get("template_content_html", "")
                        )
                defaults[key] = entry
            return JsonResponse(defaults)

        custom_urls = [
            path(
                "template-defaults/",
                self.admin_site.admin_view(template_defaults_view),
                name="messaging_template_defaults",
            ),
        ]
        return custom_urls + super().get_urls()

    fieldsets = [
        (
            "Basic Information",
            {"fields": ["event_type", "communication_method", "is_active"]},
        ),
        (
            "Template Content",
            {
                "fields": [
                    "template_subject",
                    "template_content",
                    "template_content_html",
                ],
                "description": "Use Jinja2 template syntax. Example: Hello {{ user.name }}!",
            },
        ),
        (
            "Timestamps",
            {"fields": ["created_at", "updated_at"], "classes": ["collapse"]},
        ),
    ]

    @display(description="Render example")
    def example(self, obj):
        try:
            factory = obj.factory_instance
            if not factory:
                return "-"
            rendered_subject, rendered_text = obj.render_from_template(
                obj=factory.build()
            )
            if rendered_subject:
                return rendered_subject, rendered_text
            return rendered_text
        except Exception as e:
            logger.exception(f"Failed to render message preview: {e}")
            return "-"

    @display(description="Recipient")
    def variables(self, obj):
        return obj.template_variables

    def get_form(self, request, obj=None, **kwargs):
        """Customize form to show help text for Jinja2 templates"""
        form = super().get_form(request, obj, **kwargs)
        for field in form.base_fields.keys():
            if field.startswith("template_content"):
                form.base_fields[field].widget.attrs.update(
                    {
                        "rows": 10,
                        "placeholder": _(
                            "Hello {{ recipient.name }}!\n\nYour consultation is scheduled for {{ appointment.date }}."
                        ),
                    }
                )

            if field.startswith("template_subject"):
                form.base_fields[field].widget.attrs.update(
                    {"placeholder": "Consultation with {{ practitioner.name }}"}
                )
        return form


@admin.register(TemplateValidation)
class TemplateValidationAdmin(ModelAdmin):
    list_display = [
        "event_type",
        "language_code",
        "messaging_provider",
        "display_status",
        "display_is_outdated",
        "external_template_id",
        "created_at",
        "validated_at",
    ]
    list_filter = [
        "status",
        "language_code",
        "messaging_provider",
        "event_type",
        "created_at",
        "validated_at",
    ]
    search_fields = [
        "event_type",
        "external_template_id",
        "messaging_provider__name",
        "language_code",
    ]
    readonly_fields = [
        "created_at",
        "updated_at",
        "validated_at",
        "task_logs",
        "status",
        "validation_response",
        "external_template_id",
        "content_hash",
        "display_is_outdated",
    ]

    fieldsets = [
        (
            _("Template Information"),
            {"fields": ["event_type", "messaging_provider", "language_code"]},
        ),
        (
            _("Validation Details"),
            {
                "fields": [
                    "external_template_id",
                    "content_hash",
                    "display_is_outdated",
                ],
            },
        ),
        (_("Status"), {"fields": ["status", "task_logs"]}),
        (
            _("Validation Response"),
            {
                "fields": ["validation_response"],
                "classes": ["collapse"],
            },
        ),
        (
            _("Timestamps"),
            {
                "fields": ["created_at", "updated_at", "validated_at"],
                "classes": ["collapse"],
            },
        ),
    ]

    actions = ["validate_templates", "check_validation_status"]
    actions_list = ["generate_whatsapp_validations"]

    @display(
        description=_("Status"),
        label={
            TemplateValidationStatus.created: "dark",
            TemplateValidationStatus.pending: "warning",
            TemplateValidationStatus.validated: "success",
            TemplateValidationStatus.rejected: "danger",
            TemplateValidationStatus.outdated: "warning",
        },
    )
    def display_status(self, instance):
        return instance.get_status_display()

    @display(
        description=_("Content changed"),
        label={
            "True": "warning",
            "False": "success",
        },
    )
    def display_is_outdated(self, instance):
        return str(instance.is_outdated)

    def get_queryset(self, request):
        """Filter templates based on communication method and provider capabilities"""
        qs = super().get_queryset(request)

        provider_names = []
        for provider_name, provider_class in providers.MAIN_CLASSES.items():
            if hasattr(provider_class, "validate_template") and hasattr(
                provider_class, "check_template_validation"
            ):
                provider_names.append(provider_name)

        if provider_names:
            qs = qs.filter(messaging_provider__name__in=provider_names)

        return qs.select_related("messaging_provider")

    @action(description=_("Submit templates for validation"))
    def validate_templates(self, request, queryset):
        """Submit selected templates for validation with their messaging provider."""
        for template_validation in queryset:
            template_messaging_provider_task.delay(
                template_validation.pk, "validate_template"
            )
        messages.success(
            request,
            _("%(count)d template(s) submitted for validation.")
            % {"count": queryset.count()},
        )

    @action(description=_("Check validation status"))
    def check_validation_status(self, request, queryset):
        """Check validation status for pending templates."""
        for template_validation in queryset:
            template_messaging_provider_task.delay(
                template_validation.pk, "check_template_validation"
            )
        messages.success(
            request,
            _("Checking status for %(count)d template(s).")
            % {"count": queryset.count()},
        )

    @action(
        description=_("Generate WhatsApp validations"),
        url_path="generate-whatsapp-validations",
        permissions=["generate_whatsapp_validations"],
    )
    def generate_whatsapp_validations(self, request):
        """Create a TemplateValidation for each event type, language and WhatsApp provider."""
        whatsapp_providers = MessagingProvider.objects.filter(
            communication_method=CommunicationMethod.whatsapp,
            is_active=True,
        )
        if not whatsapp_providers.exists():
            messages.warning(request, _("No active WhatsApp provider found."))
            return redirect(
                reverse_lazy("admin:messaging_templatevalidation_changelist")
            )

        created = 0
        languages = [code for code, _name in settings.LANGUAGES]
        for provider in whatsapp_providers:
            for event_type in DEFAULT_NOTIFICATION_MESSAGES:
                for lang in languages:
                    _obj, was_created = TemplateValidation.objects.get_or_create(
                        messaging_provider=provider,
                        event_type=event_type,
                        language_code=lang,
                    )
                    if was_created:
                        created += 1

        messages.success(
            request,
            _(
                "%(created)d validation(s) created for %(providers)d WhatsApp provider(s)."
            )
            % {"created": created, "providers": whatsapp_providers.count()},
        )
        return redirect(reverse_lazy("admin:messaging_templatevalidation_changelist"))

    def has_generate_whatsapp_validations_permission(self, request):
        return request.user.has_perm("messaging.add_templatevalidation")
