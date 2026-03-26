from datetime import timedelta
import hashlib
import logging
from importlib import import_module
from typing import Dict, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo
from datetime import datetime


import jinja2
from constance import config
from django.apps import apps
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import models
from django.template.defaultfilters import register
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.translation import gettext_lazy as _
from factory.django import DjangoModelFactory
from modeltranslation.utils import get_translation_fields

from . import providers
from .abstracts import ModelCeleryAbstract
from .providers import BaseMessagingProvider
from .template import DEFAULT_NOTIFICATION_MESSAGES, NOTIFICATION_CHOICES

logger = logging.getLogger(__name__)

class CommunicationMethod(models.TextChoices):
    sms = "sms", ("SMS")
    email = "email", ("Email")
    whatsapp = "whatsapp", ("WhatsApp")
    push = "push", ("Push Notification")
    manual = "manual", ("Manual")


class MessagingProvider(models.Model):
    @staticmethod
    def provider_name() -> Sequence[tuple[str, str]]:
        return providers.MAIN_DISPLAY_NAMES

    name = models.CharField(_("name"), choices=provider_name(), max_length=20)
    communication_method = models.CharField(choices=CommunicationMethod.choices)

    # Common authentication fields
    api_key = models.CharField(_("API key"), max_length=200, blank=True, null=True)
    auth_token = models.CharField(
        _("auth token"), max_length=200, blank=True, null=True
    )
    account_sid = models.CharField(
        _("account SID"), max_length=100, blank=True, null=True
    )

    # OAuth fields
    client_id = models.CharField(_("client ID"), max_length=200, blank=True, null=True)
    client_secret = models.CharField(
        _("client secret"), max_length=200, blank=True, null=True
    )

    # OVH specific fields
    application_key = models.CharField(
        _("application key"), max_length=200, blank=True, null=True
    )
    application_secret = models.CharField(
        _("application secret"), max_length=200, blank=True, null=True
    )
    consumer_key = models.CharField(
        _("consumer key"), max_length=200, blank=True, null=True
    )
    service_name = models.CharField(
        _("service name"), max_length=100, blank=True, null=True
    )

    # Sender/From fields
    from_phone = models.CharField(_("from phone"), max_length=50, blank=True, null=True)
    from_email = models.EmailField(_("from email"), blank=True, null=True)
    sender_id = models.CharField(_("sender ID"), max_length=50, blank=True, null=True)

    priority = models.IntegerField(_("priority"), default=0)
    is_active = models.BooleanField(_("is active"), default=True)

    # Prefix filtering
    excluded_prefixes = ArrayField(
        models.CharField(max_length=50),
        blank=True,
        default=list,
        verbose_name=_("excluded prefixes"),
        help_text=_(
            "Phone prefixes that should NOT use this provider. Separate multiple prefixes with commas (e.g. +33, +41, +1)"
        ),
    )
    included_prefixes = ArrayField(
        models.CharField(max_length=50),
        blank=True,
        default=list,
        verbose_name=_("included prefixes"),
        help_text=_(
            """Phone prefixes that should use this provider. """
            """Separate multiple prefixes with commas (e.g. +33, +41). """
            """If empty, all prefixes except excluded ones are allowed"""
        ),
    )

    def __str__(self):
        return f"{self.name} priority:{self.priority}"

    def matches_phone_prefix(self, phone_number: str) -> bool:
        """
        Check if a phone number matches this provider's prefix rules.

        Args:
            phone_number: The phone number to check

        Returns:
            bool: True if the phone number can use this provider, False otherwise
        """
        if not phone_number:
            return False

        # Normalize phone number (remove spaces, dashes, etc.)
        normalized_phone = (
            phone_number.replace(" ", "")
            .replace("-", "")
            .replace("(", "")
            .replace(")", "")
        )

        # Check excluded prefixes first
        if self.excluded_prefixes:
            for prefix in self.excluded_prefixes:
                if normalized_phone.startswith(prefix):
                    return False

        # If included prefixes are specified, check if phone matches any of them
        if self.included_prefixes:
            for prefix in self.included_prefixes:
                if normalized_phone.startswith(prefix):
                    return True
            return False  # Phone doesn't match any included prefix

        # If no included prefixes specified, allow all except excluded ones
        return True

    @property
    def module(self):
        return import_module(f"..providers.{self.name}", __name__)

    @property
    def instance(self) -> BaseMessagingProvider:
        return self.module.Main(self)

    def clean(self):
        """Validate prefix fields"""
        super().clean()

        def validate_prefix(prefix, field_name):
            # Strip newlines for validation
            clean_prefixes = prefix.replace("\r", "").split("\n")

            for clean_prefix in clean_prefixes:
                if not clean_prefix.startswith("+"):
                    raise ValidationError(
                        {
                            field_name: _(
                                'All prefixes must start with "+". Invalid prefix: "{}"'
                            ).format(clean_prefix)
                        }
                    )

                # Check that the prefix contains only + and digits
                if not all(c.isdigit() or c == "+" for c in clean_prefix):
                    raise ValidationError(
                        {
                            field_name: _(
                                'Prefixes can only contain "+" and digits. Invalid prefix: "{}"'
                            ).format(clean_prefix)
                        }
                    )

        # Validate excluded_prefixes
        if self.excluded_prefixes:
            for prefix in self.excluded_prefixes:
                validate_prefix(prefix, "excluded_prefixes")

        # Validate included_prefixes
        if self.included_prefixes:
            for prefix in self.included_prefixes:
                validate_prefix(prefix, "included_prefixes")

    def save(self, *args, **kwargs):
        self.communication_method = providers.MAIN_CLASSES.get(
            self.name
        ).communication_method

        # Clean whitespace from prefix arrays
        if self.excluded_prefixes:
            self.excluded_prefixes = [
                prefix.strip() for prefix in self.excluded_prefixes if prefix.strip()
            ]

        if self.included_prefixes:
            self.included_prefixes = [
                prefix.strip() for prefix in self.included_prefixes if prefix.strip()
            ]

        return super(MessagingProvider, self).save(*args, **kwargs)

    def test(self):
        try:
            self.instance.test_connection()
        except Exception as e:
            return f"Test failed: {e}"

    class Meta:
        verbose_name = _("messaging provider")
        verbose_name_plural = _("messaging providers")
        # unique_together = ["communication_method", "priority"]


def get_model_choices():
    """Legacy function kept for old migrations compatibility."""
    return []


class Template(models.Model):
    _action = None

    @property
    def action(self):
        if not self._action:
            self._action = DEFAULT_NOTIFICATION_MESSAGES[self.event_type].get("action")
        return self._action

    action_label = models.CharField(
        _("action label"),
        max_length=100,
        help_text=_("Label display in the action"),
    )

    event_type = models.CharField(
        _("system name"),
        max_length=100,
        unique=True,
        choices=NOTIFICATION_CHOICES,
        help_text=_("Unique identifier for the template"),
    )

    template_content_html = models.TextField(
        _("template html"),
        help_text=_(
            "Jinja2 template for message content in html, use {{ obj }} to get object attributes"
        ),
        blank=True,
        null=True,
    )

    template_content = models.TextField(
        _("template text"),
        help_text=_(
            "Jinja2 template for message content, use {{ obj }} to get object attributes"
        ),
    )

    template_subject = models.CharField(
        _("template subject"),
        max_length=500,
        blank=True,
        help_text=_("Jinja2 template for message subject"),
    )

    communication_method = ArrayField(
        base_field=models.CharField(max_length=10, choices=CommunicationMethod.choices),
        default=list,
        blank=True,
    )
    is_active = models.BooleanField(_("is active"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @staticmethod
    def get_template(name: str, event_type: str) -> "Template":
        # First try: override specific to this communication method
        try:
            return Template.objects.get(
                communication_method__contains=[name],
                event_type=event_type,
                is_active=True,
            )
        except Template.DoesNotExist:
            pass

        # Second try: generic override (empty communication_method = all methods)
        try:
            return Template.objects.get(
                communication_method=[],
                event_type=event_type,
                is_active=True,
            )
        except Template.DoesNotExist:
            pass

        # Fallback: defaults from template.py
        return Template(
            event_type=event_type,
            template_subject=DEFAULT_NOTIFICATION_MESSAGES[event_type][
                "template_subject"
            ],
            template_content=DEFAULT_NOTIFICATION_MESSAGES[event_type][
                "template_content"
            ],
            action_label=DEFAULT_NOTIFICATION_MESSAGES[event_type].get("action_label"),
            template_content_html=DEFAULT_NOTIFICATION_MESSAGES[event_type][
                "template_content_html"
            ],
        )

    @staticmethod
    def get_field_template(name: str, event_type: str, field: str) -> str:
        # First try: override specific to this communication method
        try:
            template = Template.objects.get(
                communication_method__contains=[name],
                event_type=event_type,
                is_active=True,
            )
            content = getattr(template, f"template_{field}")
            if content:
                return content
        except Template.DoesNotExist:
            pass

        # Second try: generic override (empty communication_method = all methods)
        try:
            template = Template.objects.get(
                communication_method=[],
                event_type=event_type,
                is_active=True,
            )
            content = getattr(template, f"template_{field}")
            if content:
                return content
        except Template.DoesNotExist:
            pass

        # Fallback: defaults from template.py
        return DEFAULT_NOTIFICATION_MESSAGES[event_type][field]

    @property
    def model(self) -> Optional[str]:
        """Get expected model from DEFAULT_NOTIFICATION_MESSAGES based on event_type."""
        if self.event_type and self.event_type in DEFAULT_NOTIFICATION_MESSAGES:
            return DEFAULT_NOTIFICATION_MESSAGES[self.event_type].get("model")
        return None

    @property
    def factory_instance(self) -> Optional[DjangoModelFactory]:
        if self.model:
            app_label, model_name = self.model.split(".", 1)
            factory_module = import_module(f"{app_label}.factories")
            return getattr(factory_module, f"{model_name}Factory", None)

    class Meta:
        verbose_name = _("template")
        verbose_name_plural = _("templates")

    def clean(self):
        """Validate Jinja2 template syntax"""
        super().clean()
        env = jinja2.Environment()
        env.filters.update(register.filters)

        # Validate template_text
        try:
            for field_name in get_translation_fields("template_content"):
                env.parse(getattr(self, field_name))
        except jinja2.TemplateSyntaxError as e:
            raise ValidationError(
                {field_name: _("Invalid Jinja2 template syntax: {}").format(str(e))}
            )

        # # Validate template_subject if not empty
        try:
            for field_name in get_translation_fields("template_subject"):
                env.parse(getattr(self, field_name))
        except jinja2.TemplateSyntaxError as e:
            raise ValidationError(
                {field_name: _("Invalid Jinja2 template syntax: {}").format(str(e))}
            )

    def render_from_template(self, obj=None, context: Optional[Dict] = None):
        """
        Render the template using the provided context and object

        Args:
            context (dict): Dictionary containing template variables
            obj: Object instance to validate against the expected model and include in context

        Returns:
            tuple: (rendered_subject, rendered_text)

        Raises:
            jinja2.TemplateError: If template rendering fails
            ValidationError: If object is not an instance of the expected model
        """
        # Validate object if provided and model is specified
        if obj is not None and self.model:
            try:
                app_label, model_name = self.model.split(".", 1)
                expected_model = apps.get_model(app_label, model_name)

                if not isinstance(obj, expected_model):
                    raise ValidationError(
                        f"Object must be an instance of {self.model}, "
                        f"got {obj.__class__.__module__}.{obj.__class__.__name__}"
                    )
            except (ValueError, LookupError) as e:
                raise ValidationError(
                    f"Invalid model specification '{self.model}': {e}"
                )

        # Create context copy and add object
        render_context = context.copy() if context else {}
        if obj is not None:
            render_context["obj"] = obj

        env = jinja2.Environment()
        env.filters.update(register.filters)

        # Render template text
        text_template = env.from_string(self.template_content)
        rendered_text = text_template.render(render_context)

        # Render template subject
        rendered_subject = ""
        if self.template_subject:
            subject_template = env.from_string(self.template_subject)
            rendered_subject = subject_template.render(render_context)

        return rendered_subject, rendered_text

    def _extract_variable_paths(self, node, parent_is_getattr=False):
        """
        Recursively extract full variable paths from Jinja2 AST nodes

        Args:
            node: Jinja2 AST node
            parent_is_getattr: Boolean to track if parent node is already a Getattr

        Returns:
            list: List of variable paths
        """
        paths = []

        if hasattr(node, "__class__"):
            class_name = node.__class__.__name__

            # Handle simple variable references ({{ variable }})
            if class_name == "Name" and not parent_is_getattr:
                paths.append(node.name)

            # Handle attribute access ({{ obj.field.subfield }})
            elif class_name == "Getattr":
                # Build the full path by traversing the chain
                parts = []
                current = node

                while hasattr(current, "attr"):
                    parts.append(current.attr)
                    current = current.node

                if hasattr(current, "name"):
                    parts.append(current.name)
                    # Reverse to get proper order
                    full_path = ".".join(reversed(parts))
                    paths.append(full_path)

                # Don't recurse into the child nodes of Getattr as we've processed the full chain
                return paths

        # Recursively process child nodes
        if hasattr(node, "__iter__") and not isinstance(node, (str, bytes)):
            try:
                for child in node:
                    is_child_of_getattr = (
                        hasattr(node, "__class__")
                        and node.__class__.__name__ == "Getattr"
                    )
                    paths.extend(
                        self._extract_variable_paths(child, is_child_of_getattr)
                    )
            except (TypeError, AttributeError):
                pass

        # Process attributes that might contain nodes
        if hasattr(node, "__dict__"):
            for attr_name, attr_value in node.__dict__.items():
                if (
                    attr_value is not None
                    and attr_value != node
                    and not attr_name.startswith("_")
                ):
                    # Skip 'node' and 'attr' attributes of Getattr to avoid processing parts of the chain
                    if (
                        hasattr(node, "__class__")
                        and node.__class__.__name__ == "Getattr"
                        and attr_name in ["node", "attr"]
                    ):
                        continue
                    paths.extend(
                        self._extract_variable_paths(attr_value, parent_is_getattr)
                    )

        return paths

    @property
    def template_variables(self):
        """
        Extract all variable paths used in the Jinja2 templates

        Returns:
            list: List of variable paths found in both subject and text templates
                 (e.g., ['participant.appointment.scheduled_at', 'user.name'])
        """
        variables = set()

        try:
            env = jinja2.Environment()
            env.filters.update(register.filters)

            # Extract variables from template_text
            if self.template_content:
                text_ast = env.parse(self.template_content)
                variables.update(self._extract_variable_paths(text_ast))

            # Extract variables from template_subject
            if self.template_subject:
                subject_ast = env.parse(self.template_subject)
                variables.update(self._extract_variable_paths(subject_ast))

        except jinja2.TemplateSyntaxError:
            # If template has syntax errors, return empty list
            pass

        return sorted(list(variables))


class TemplateValidationStatus(models.TextChoices):
    created = "created", _("Created")
    pending = "pending", _("Pending")
    validated = "validated", _("Validated")
    rejected = "rejected", _("Rejected")
    failed = "failed", _("Failed")
    outdated = "outdated", _("Outdated")
    unused = "unused", _("Unused")


class TemplateValidation(ModelCeleryAbstract):
    external_template_id = models.CharField(
        _("external template ID"),
        max_length=200,
        blank=True,
        help_text=_(
            "External template ID from the messaging provider (populated after validation submission)"
        ),
    )
    messaging_provider = models.ForeignKey(
        MessagingProvider,
        on_delete=models.CASCADE,
        verbose_name=_("messaging provider"),
        help_text=_("The messaging provider where the template is validated"),
    )
    event_type = models.CharField(
        _("event type"),
        max_length=100,
        choices=NOTIFICATION_CHOICES,
        help_text=_("The template event type to validate"),
    )
    language_code = models.CharField(
        _("language code"),
        max_length=5,
        help_text=_(
            'Language code for the template validation (e.g., "en", "fr", "de")'
        ),
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=TemplateValidationStatus.choices,
        default=TemplateValidationStatus.created,
        help_text=_("Current validation status"),
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    validated_at = models.DateTimeField(
        null=True, blank=True, help_text=_("When the template was validated")
    )

    # Additional validation info
    validation_response = models.JSONField(
        blank=True,
        null=True,
        help_text=_("Response from the messaging provider during validation"),
    )
    content_hash = models.CharField(
        max_length=32,
        blank=True,
        help_text=_("MD5 hash of template content at last validation submission"),
    )

    class Meta:
        verbose_name = _("template validation")
        verbose_name_plural = _("template validations")
        unique_together = ["messaging_provider", "event_type", "language_code"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type} [{self.language_code}] - {self.messaging_provider.name} ({self.get_status_display()})"

    @property
    def template(self) -> Template:
        """Resolve the template (DB override or default) for this validation's provider."""
        return Template.get_template(
            name=self.messaging_provider.communication_method,
            event_type=self.event_type,
        )

    def compute_content_hash(self) -> str:
        """Compute MD5 hash of the resolved template content for the given language."""
        tpl = self.template
        parts = [
            str(getattr(tpl, f"template_subject_{self.language_code}", "") or ""),
            str(getattr(tpl, f"template_content_{self.language_code}", "") or ""),
            str(getattr(tpl, f"template_content_html_{self.language_code}", "") or ""),
            str(tpl.action_label or ""),
        ]
        return hashlib.md5("|".join(parts).encode()).hexdigest()

    @property
    def is_outdated(self) -> bool:
        """Check if the template content has changed since last validation."""
        if not self.content_hash:
            return True
        return self.content_hash != self.compute_content_hash()


class MessageStatus(models.TextChoices):
    pending = "pending", "Pending"
    sending = "sending", "Sending"
    sent = "sent", "Sent"
    delivered = "delivered", "Delivered"
    failed = "failed", "Failed"
    read = "read", "Read"


class Message(ModelCeleryAbstract):
    # Message content
    content = models.TextField(_("content text"), blank=True, null=True)
    content_html = models.TextField(_("content html"), blank=True, null=True)
    subject = models.CharField(_("subject"), max_length=200, blank=True, null=True)
    template_system_name = models.CharField(
        choices=NOTIFICATION_CHOICES, blank=True, null=True
    )

    in_notification = models.BooleanField(
        help_text="Show in notification user ring", default=True
    )

    # Message type and provider
    communication_method = models.CharField(
        _("communication method"),
        choices=CommunicationMethod.choices,
        max_length=20,
        null=True,
        blank=True,
    )
    provider_name = models.CharField(_("provider name"), max_length=50, blank=True)

    # Recipients
    recipient_phone = models.CharField(
        _("recipient phone"), max_length=50, blank=True, null=True
    )
    recipient_email = models.EmailField(_("recipient email"), blank=True, null=True)

    # Status tracking
    status = models.CharField(
        _("status"),
        choices=MessageStatus.choices,
        max_length=20,
        default=MessageStatus.pending,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)

    # External provider info
    external_message_id = models.CharField(max_length=200, blank=True)
    error_message = models.TextField(blank=True, null=True)

    # Sender
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_messages",
    )

    # Recipient
    sent_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_messages",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, blank=True, null=True
    )
    object_id = models.PositiveIntegerField(blank=True, null=True)
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
        ]

    @property
    def object_model(self):
        if self.content_type:
            model_class = self.content_type.model_class()
            if model_class:
                return f"{self.content_type.app_label}.{model_class.__name__}"
        return None

    @property
    def object_pk(self):
        return self.object_id

    def __str__(self):
        return (
            f"Message to {self.recipient_phone or self.recipient_email} - {self.status}"
        )

    @property
    def phone_number(self):
        if self.sent_to and self.sent_to.mobile_phone_number:
            return self.sent_to.mobile_phone_number
        if self.recipient_phone:
            return self.recipient_phone

    @property
    def template_is_valid(self) -> bool:
        try:
            self.render_content
            self.render_subject
            self.render_content_html
            return True
        except:
            return False

    @property
    def template_invalid_msg(self):
        try:
            self.render_content
            self.render_subject
            self.render_content_html
        except Exception as e:
            return e

    @property
    def email(self):
        if self.sent_to and self.sent_to.email:
            return self.sent_to.email
        if self.recipient_email:
            return self.recipient_email

    @property
    def recipient(self):
        return self.email or self.phone_number

    @property
    def validated_communication_method(self):
        if self.communication_method:
            return self.communication_method
        if self.sent_to and self.sent_to.communication_method:
            return self.sent_to.communication_method

    @property
    def action(self):
        return self.template.action

    @property
    def action_label(self):
        if self.template:
            return self.template.action_label

    additionnal_link_args = models.JSONField(blank=True, null=True)

    @property
    def access_link(self):
        if not self.template or not self.template.action:
            return
        """Generate access link if template has an action defined"""
        is_patient = self.sent_to.is_patient
        base_url = (
            config.patient_base_url
            if is_patient
            else config.practitioner_base_url
        )
        logger.debug(
            "access_link: message_id=%s is_patient=%s base_url=%s",
            self.pk, is_patient, base_url,
        )

        if self.sent_to.one_time_auth_token:
            full_url = f"{base_url}?auth={self.sent_to.one_time_auth_token}&action={self.action}&id={self.object_pk}&model={self.object_model}"
        else:
            full_url = f"{base_url}?email={self.sent_to.email}&action={self.action}&id={self.object_pk}&model={self.object_model}"

        if self.additionnal_link_args:
            full_url += "".join(
                [f"&{key}={value}" for key, value in self.additionnal_link_args.items()]
            )

        return full_url

    @property
    def render_content(self):
        try:
            return self.render("template_content")
        except Exception as e:
            logger.exception("render_content failed for message_id=%s: %s", self.pk, e)
            return ""

    @property
    def render_content_sms(self):
        try:
            message_text = self.render("template_content")
            if self.action_label:
                return f"{message_text}\n{self.action_label} {self.access_link}"
            return message_text
        except Exception as e:
            logger.exception("render_content_sms failed for message_id=%s: %s", self.pk, e)
            return ""

    @property
    def render_content_html(self):
        try:
            return self.render("template_content_html")
        except Exception as e:
            logger.exception("render_content_html failed for message_id=%s: %s", self.pk, e)
            return ""

    @property
    def render_full_html(self):
        """Render the complete HTML email with base template"""
        try:
            from constance import config as constance_config
            from users.models import Organisation

            content_html = self.render_content_html
            subject = self.render_subject
            main_org = Organisation.objects.filter(is_main=True).first()

            return render_to_string(
                "messaging/email_base.html",
                {
                    "content": content_html,
                    "subject": subject,
                    "action_label": self.action_label,
                    "access_link": self.access_link,
                    "organisation": main_org,
                    "branding": constance_config.site_name,
                    "has_logo": bool(main_org and main_org.logo_white),
                },
            )
        except Exception as e:
            logger.exception("render_full_html failed for message_id=%s: %s", self.pk, e)
            return f"Unable to render full HTML: {e}"

    @property
    def render_subject(self):
        return self.render("template_subject")

    def _get_appointment(self):
        """Return the Appointment linked to this message, or None."""
        if not self.content_object:
            return None

        from consultations.models import Appointment, Participant

        if isinstance(self.content_object, Appointment):
            return self.content_object
        if isinstance(self.content_object, Participant):
            return self.content_object.appointment
        return None

    @property
    def ics_attachment(self) -> Optional[Tuple[str, str, str]]:
        """
        Generate ICS calendar file for Appointment objects.

        Returns:
            Optional tuple of (filename, content, mime_type) for appointments,
            None otherwise.
        """

        appointment = self._get_appointment()
        if not appointment:
            return None

        def fmt(dt: datetime) -> str:
            if dt.tzinfo is None:
                dt = timezone.make_aware(dt)
            return dt.astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")

        domain = getattr(settings, "SITE_DOMAIN", "hcw.local")
        end_at = appointment.end_expected_at or (
            appointment.scheduled_at + timedelta(hours=1)
        )

        description = ""
        if appointment.consultation:
            if appointment.consultation.title:
                description += f"Consultation: {appointment.consultation.title}"
            if appointment.consultation.description:
                if description:
                    description += "\\n"
                description += appointment.consultation.description

        organizer_name = ""
        organizer_email = ""
        if appointment.created_by and appointment.created_by.email:
            organizer_name = (
                f"{appointment.created_by.first_name} "
                f"{appointment.created_by.last_name}"
            ).strip()
            organizer_email = appointment.created_by.email

        ics_content = render_to_string(
            "messaging/appointment.ics",
            {
                "uid": f"appointment-{appointment.pk}@{domain}",
                "dtstamp": fmt(timezone.now()),
                "dtstart": fmt(appointment.scheduled_at),
                "dtend": fmt(end_at),
                "summary": appointment.title or "Consultation",
                "description": description,
                "location": "In Person" if appointment.type == "inPerson" else "",
                "organizer_name": organizer_name,
                "organizer_email": organizer_email,
                "status": appointment.status.upper(),
            },
        )
        # ICS requires CRLF line endings
        ics_content = ics_content.replace("\r\n", "\n").replace("\n", "\r\n")

        return (f"appointment_{appointment.pk}.ics", ics_content, "text/calendar")

    _template = None

    @property
    def template(self) -> Template:
        if not self._template and self.template_system_name:
            self._template = Template.get_template(
                name=self.validated_communication_method,
                event_type=self.template_system_name,
            )
        return self._template

    @property
    def language(self):
        return self.sent_to.preferred_language or settings.LANGUAGE_CODE

    def render(self, field: str):
        if not self.template_system_name:
            return getattr(self, field.replace("template_", ""))

        try:
            obj = self.content_object
            logger.debug(
                "render: message_id=%s field=%s template=%s language=%s",
                self.pk, field, self.template_system_name, self.language,
            )

            with (
                translation.override(self.language),
                timezone.override(self.sent_to.user_tz),
            ):
                env = jinja2.Environment(extensions=['jinja2.ext.i18n'])
                env.install_gettext_callables(
                    translation.gettext,
                    translation.ngettext,
                    newstyle=True,
                )
                env.filters['localtime'] = timezone.localtime
                env.filters.update(register.filters)

                template_str = str(getattr(self.template, field))
                logger.debug(
                    "render: template_str for field=%s length=%d",
                    field, len(template_str) if template_str else 0,
                )

                text_template = env.from_string(template_str)
                result = text_template.render(
                    {
                        "obj": obj,
                        "config": config,
                        "action": self.action,
                        "action_label": self.action_label,
                        "access_link": self.access_link,
                    }
                )
                logger.debug("render: field=%s result length=%d", field, len(result) if result else 0)
                return result

        except Exception as e:
            logger.exception("render failed: message_id=%s field=%s error=%s", self.pk, field, e)
            raise Exception(f"Unable to render: {e}")

    def clean(self):
        """Validate prefix fields"""
        super().clean()

        if not (self.recipient_email or self.recipient_phone or self.sent_to):
            raise ValidationError(
                _(
                    "You must specify at least a recipient phone, a recipient email or a user in Sent to"
                )
            )

        if (
            self.communication_method
            in [
                CommunicationMethod.sms,
                CommunicationMethod.whatsapp,
            ]
            and not self.phone_number
        ):
            raise ValidationError(
                {
                    "recipient_phone": _(
                        "The Sent to user has no phone number, so recipient phone is mandatory"
                    )
                }
            )

        if self.communication_method == CommunicationMethod.email and not self.email:
            raise ValidationError(
                {
                    "recipient_email": _(
                        "The Sent to user has no email, so recipient email is mandatory"
                    )
                }
            )

        if not self.communication_method and not self.sent_to:
            raise ValidationError(
                {
                    "communication_method": _(
                        "Communication method is required if no sent to user"
                    )
                }
            )

        if self.template_system_name and self.content_type:
            expected_model = DEFAULT_NOTIFICATION_MESSAGES.get(
                self.template_system_name, {}
            ).get("model")
            if expected_model:
                app_label, model_name = expected_model.split(".")
                if (
                    self.content_type.app_label != app_label
                    or self.content_type.model != model_name.lower()
                ):
                    raise ValidationError(
                        {
                            "content_type": _(
                                "The linked object type (%(actual)s) does not match "
                                "the expected model (%(expected)s) for template "
                                '"%(template)s".'
                            )
                            % {
                                "actual": f"{self.content_type.app_label}.{self.content_type.model}",
                                "expected": expected_model,
                                "template": self.template_system_name,
                            }
                        }
                    )
