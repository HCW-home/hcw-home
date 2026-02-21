import uuid
from zoneinfo import ZoneInfo, available_timezones

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.contrib.contenttypes.fields import GenericRelation
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.fields import BLANK_CHOICE_DASH
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from fcm_django.models import AbstractFCMDevice, FirebaseResponseDict
from firebase_admin.messaging import Message
from firebase_admin.messaging import Notification as FireBaseNotification
from location_field.models.plain import PlainLocationField
from messaging.models import CommunicationMethod

from .abstracts import ModelOwnerAbstract
from .managers import UserManager

# Create your models here.


class Term(models.Model):
    name = models.CharField()
    content = models.TextField()
    # valid_until = models.DateTimeField(null=True, blank=True)
    use_for_patient = models.BooleanField(default=False)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.use_for_patient:
            # Save first if this is a new instance to get a pk
            is_new = self.pk is None
            if is_new:
                super().save(*args, **kwargs)
            # Set all other terms to False
            Term.objects.exclude(pk=self.pk).update(use_for_patient=False)
            # Save again only if it's an existing instance
            if not is_new:
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)


class Organisation(models.Model):
    name = models.CharField(max_length=200)
    logo_large = models.ImageField(upload_to="organisations/", blank=True, null=True)
    logo_small = models.ImageField(upload_to="organisations/", blank=True, null=True)
    primary_color = models.CharField(max_length=7, blank=True, null=True)
    default_term = models.ForeignKey(
        Term, on_delete=models.SET_NULL, null=True, blank=True
    )
    location = PlainLocationField(based_fields=["city"], zoom=7, blank=True, null=True)
    street = models.CharField(max_length=200, blank=True, null=True)
    city = models.CharField(max_length=50, blank=True, null=True)
    postal_code = models.CharField(max_length=10, blank=True, null=True)
    country = models.CharField(max_length=50, blank=True, null=True)
    footer = models.TextField(blank=True, null=True)

    is_main = models.BooleanField(
        default=False,
        help_text="Define is this organisation will be default for patient",
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.is_main:
            domain_list = self.__class__.objects.filter(is_main=True).exclude(
                pk=self.pk
            )
            domain_list.update(is_main=False)

        return super().save(*args, **kwargs)


class Language(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=3, unique=True)

    def __str__(self):
        return self.name


class Speciality(models.Model):
    name = models.CharField(_("name"), max_length=100)

    class Meta:
        verbose_name = _("speciality")
        verbose_name_plural = _("specialities")

    def __str__(self):
        return self.name


class FCMDeviceOverride(AbstractFCMDevice):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class User(AbstractUser):
    def __str__(self):
        return self.name

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    username = None

    email = models.EmailField(_("email address"), blank=True, null=True, unique=True)

    app_preferences = models.JSONField(null=True, blank=True)
    encrypted = models.BooleanField(default=False)

    picture = models.ImageField(upload_to="users/", blank=True, null=True)

    job_title = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Job title or professional designation",
    )

    languages = models.ManyToManyField(Language, blank=True)

    preferred_language = models.CharField(
        max_length=10,
        choices=settings.LANGUAGES,
        help_text="Preferred language for the user interface",
        null=True,
        blank=True,
    )

    is_online = models.BooleanField(default=False)

    last_notification = models.DateTimeField(default=timezone.now)

    specialities = models.ManyToManyField(Speciality, blank=True)
    organisations = models.ManyToManyField("users.Organisation", blank=True)
    accepted_term = models.ForeignKey(
        Term, on_delete=models.SET_NULL, null=True, blank=True
    )
    main_organisation = models.ForeignKey(
        "users.Organisation",
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name="users_mainorganisation",
    )
    communication_method = models.CharField(
        choices=CommunicationMethod.choices, default=CommunicationMethod.email
    )
    mobile_phone_number = models.CharField(null=True, blank=True)
    timezone = models.CharField(
        max_length=63,
        choices=[(tz, tz) for tz in sorted(available_timezones())],
        default=settings.TIME_ZONE,
        help_text="User timezone for displaying dates and times",
    )
    location = PlainLocationField(
        based_fields=["first_name"], zoom=7, blank=True, null=True
    )

    # Authentication fields (moved from Participant)
    temporary = models.BooleanField(
        default=False,
        help_text="Indicates if this is a temporary user created for appointments",
    )
    one_time_auth_token = models.CharField(
        max_length=256,
        blank=True,
        null=True,
        help_text="Authentication token for appointment access",
    )
    verification_code = models.IntegerField(null=True, blank=True)
    verification_code_created_at = models.DateTimeField(null=True, blank=True)
    verification_attempts = models.IntegerField(default=0)

    email_verified = models.BooleanField(
        default=False,
        help_text="Whether the user's email address has been verified",
    )
    email_verification_token = models.CharField(
        max_length=256,
        blank=True,
        null=True,
        help_text="Token used for email verification",
    )

    is_practitioner = models.BooleanField(
        default=False,
        help_text="Whether this user is a practitioner",
    )

    notification_messages = GenericRelation("messaging.Message")

    @property
    def is_patient(self):
        return not self.is_practitioner

    @property
    def name(self) -> str:
        if self.first_name or self.last_name:
            if self.email:
                return f"{self.first_name} {self.last_name} ({self.email})"
            return f"{self.first_name} {self.last_name}"
        return self.email or f"User #{self.pk}"

    @property
    def user_tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone) or ZoneInfo(settings.TIME_ZONE)

    def send_user_notification(self, title, message) -> FirebaseResponseDict:
        # Docs https://fcm-django.readthedocs.io/en/latest/
        """
        Send notification to user over Firebase Cloud Messaging (FCM).

        :param title: notification
        :param message: Notification body
        """

        message = Message(
            notification=FireBaseNotification(title=title, body=message),
        )

        devices = FCMDeviceOverride.objects.filter(user=self)
        return devices.send_message(message)

    def save(self, *args, **kwargs):
        if self.temporary and not self.one_time_auth_token:
            self.one_time_auth_token = str(uuid.uuid4())
            self.verification_code_created_at = timezone.now()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["first_name", "last_name", "email"]


class HealthMetric(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_health_metrics_creator",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    measured_at = models.DateTimeField(help_text="When the measurements were taken")

    measured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_health_metrics",
        help_text="Clinician or device user who recorded the measurements (optional)",
    )

    # Source / metadata
    source = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Measurement source (manual, device, EHR import, etc.)",
    )
    notes = models.TextField(
        null=True, blank=True, help_text="Free text notes related to this measurement"
    )

    created_at = models.DateTimeField(
        auto_now_add=True, help_text="Record creation timestamp"
    )
    updated_at = models.DateTimeField(auto_now=True, help_text="Last update timestamp")

    class Meta:
        indexes = [
            models.Index(fields=["user", "measured_at"]),
        ]
        ordering = ["-measured_at"]

    def __str__(self):
        return f"{self.user} @ {self.measured_at:%Y-%m-%d %H:%M}"

    acknowledged_at = models.DateTimeField(blank=True, null=True)
