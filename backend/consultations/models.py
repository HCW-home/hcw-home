import re
import uuid
from datetime import time
from enum import Enum
from zoneinfo import available_timezones

from constance import config
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _
from django_clamd.validators import validate_file_infection
from messaging.models import CommunicationMethod
from users.models import User

from core.storage import TenantUploadTo

from . import assignments
from .managers import ConsultationManager

# Create your models here.


class Queue(models.Model):
    name = models.CharField(_("name"), max_length=200)
    organisation = models.ManyToManyField(
        "users.Organisation", blank=True, verbose_name=_("organisation")
    )
    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, verbose_name=_("users"), blank=True
    )

    class Meta:
        verbose_name = _("queue")
        verbose_name_plural = _("queues")

    def __str__(self):
        return f"{self.name}"


class Type(models.TextChoices):
    online = "online", _("Online")
    inperson = "inPerson", _("In person")


class Consultation(models.Model):
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    closed_at = models.DateTimeField(_("closed at"), null=True, blank=True)

    description = models.CharField(_("description"), null=True, blank=True)
    title = models.CharField(_("title"), null=True, blank=True)

    beneficiary = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name=_("beneficiary"),
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="%(class)s_created",
        verbose_name=_("created by"),
    )

    group = models.ForeignKey(
        Queue, on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_("group")
    )

    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_owned",
        verbose_name=_("owned by"),
    )

    visible_by_patient = models.BooleanField(
        _("visible by patient"), default=True
    )

    objects = ConsultationManager()

    class Meta:
        verbose_name = _("consultation")
        verbose_name_plural = _("consultations")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Consultation #{self.pk}"


class AppointmentStatus(models.TextChoices):
    draft = "draft", _("Draft")
    scheduled = "scheduled", _("Scheduled")
    cancelled = "cancelled", _("Cancelled")


class Appointment(models.Model):
    type = models.CharField(choices=Type.choices, default=Type.online)
    title = models.CharField(_("title"), max_length=255, null=True, blank=True)
    status = models.CharField(
        _("status"),
        choices=AppointmentStatus.choices,
        default=AppointmentStatus.scheduled,
    )
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.CASCADE,
        related_name="appointments",
        null=True,
        blank=True,
        verbose_name=_("consultation"),
    )
    scheduled_at = models.DateTimeField(_("scheduled at"))
    previous_scheduled_at = models.DateTimeField(
        _("scheduled at"), null=True, blank=True
    )
    end_expected_at = models.DateTimeField(_("end expected at"), null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        verbose_name=_("created by"),
        related_name="appointments_created",
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    participants = models.ManyToManyField(
        User,
        through="Participant",
        related_name="appointments_participating",
    )

    @property
    def active_participants(self):
        return self.participants.filter(is_active=True)

    class Meta:
        verbose_name = _("appointment")
        verbose_name_plural = _("appointments")
        ordering = ["scheduled_at"]


class AppointmentRecording(models.Model):
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name="recordings",
        verbose_name=_("appointment"),
    )
    egress_id = models.CharField(_("egress ID"), max_length=255, unique=True)
    filepath = models.CharField(
        _("S3 filepath"), max_length=500, help_text=_("S3 key set at recording start")
    )
    started_at = models.DateTimeField(_("started at"), auto_now_add=True)
    stopped_at = models.DateTimeField(_("stopped at"), null=True, blank=True)
    message = models.OneToOneField(
        "Message",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recording",
        verbose_name=_("message"),
    )

    class Meta:
        verbose_name = _("appointment recording")
        verbose_name_plural = _("appointment recordings")
        ordering = ["-started_at"]


class ParticipantStatus(Enum):
    draft = "draft"
    invited = "invited"
    confirmed = "confirmed"
    unavailable = "unavailable"
    cancelled = "cancelled"


class Participant(models.Model):
    appointment = models.ForeignKey(
        Appointment, on_delete=models.CASCADE, verbose_name=_("appointment")
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name=_("user"))

    is_active = models.BooleanField(default=True)
    is_invited = models.BooleanField(default=True)
    is_confirmed = models.BooleanField(null=True, blank=True)
    is_notified = models.BooleanField(default=False)
    feedback_rate = models.IntegerField(null=True, blank=True)
    feedback_message = models.TextField(null=True, blank=True)

    @property
    def status(self):
        if not self.is_active:
            return ParticipantStatus.cancelled.value
        if self.is_confirmed == True:
            return ParticipantStatus.confirmed.value
        if self.is_confirmed == False:
            return ParticipantStatus.unavailable.value
        if self.is_invited:
            return ParticipantStatus.invited.value
        return ParticipantStatus.draft.value

    @property
    def auth_token(self):
        """Get one_time_auth_token from associated User"""
        return self.user.one_time_auth_token if self.user else None

    @property
    def access_url(self):
        """Generate patient access URL for participants without email or phone."""
        if not self.user or not self.user.one_time_auth_token:
            return None
        if self.user.email or self.user.mobile_phone_number:
            return None
        return f"{config.patient_base_url}/?auth={self.user.one_time_auth_token}"

    @property
    def name(self) -> str:
        """Get display name of the participant"""
        return self.user.name or self.user.email

    notification_messages = GenericRelation("messaging.Message")

    class Meta:
        unique_together = ["user", "appointment"]


class Message(models.Model):
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name=_("consultation"),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        verbose_name=_("created by"),
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    is_edited = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(_("deleted at"), blank=True, null=True)

    event = models.TextField(_("event"), null=True, blank=True)
    content = models.TextField(_("content"), null=True, blank=True)
    attachment = models.FileField(
        _("attachment"),
        upload_to=TenantUploadTo("messages_attachment"),
        null=True,
        blank=True,
        validators=[validate_file_infection],
    )
    recording_url = models.CharField(
        _("recording S3 key"),
        max_length=500,
        null=True,
        blank=True,
        help_text=_("S3 key/path for call recordings"),
    )

    notification_messages = GenericRelation("messaging.Message")

    class Meta:
        verbose_name = _("message")
        verbose_name_plural = _("messages")


class Reason(models.Model):
    speciality = models.ForeignKey(
        "users.Speciality",
        on_delete=models.CASCADE,
        related_name="reasons",
        verbose_name=_("speciality"),
    )
    name = models.CharField(_("name"))
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    queue_assignee = models.ForeignKey(
        Queue,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_("queue assignee"),
    )
    user_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_("user assignee"),
    )
    duration = models.IntegerField(
        _("duration"), help_text=_("Duration in minutes"), default=30
    )
    is_active = models.BooleanField(_("is active"), default=True)

    assignment_method = models.CharField(choices=assignments.MAIN_DISPLAY_NAMES)

    class Meta:
        verbose_name = _("reason")
        verbose_name_plural = _("reasons")

    def __str__(self):
        return f"{self.name}"

    # def clean(self):
    #     super().clean()

    #     if self.assignment_method == ReasonAssignmentMethod.USER:
    #         if self.queue_assignee:
    #             raise ValidationError(
    #                 _(
    #                     f"Queue must not be defined if assignment method is {ReasonAssignmentMethod.USER}."
    #                 )
    #             )
    #         if not self.user_assignee:
    #             raise ValidationError(
    #                 _(
    #                     f"User must be defined if assignment method is {ReasonAssignmentMethod.USER}."
    #                 )
    #             )

    #     if self.assignment_method == ReasonAssignmentMethod.QUEUE:
    #         if not self.queue_assignee:
    #             raise ValidationError(
    #                 _(
    #                     f"Queue must be defined if assignment method is {ReasonAssignmentMethod.QUEUE}."
    #                 )
    #             )
    #         if self.user_assignee:
    #             raise ValidationError(
    #                 _(
    #                     f"User must not be defined if assignment method is {ReasonAssignmentMethod.QUEUE}."
    #                 )
    #             )

    #     if self.assignment_method == ReasonAssignmentMethod.APPOINTMENT:
    #         if self.user_assignee or self.queue_assignee:
    #             raise ValidationError(
    #                 _(
    #                     f"User or Queue must not be defined if assignment method is {ReasonAssignmentMethod.APPOINTMENT}."
    #                 )
    #             )


class RequestStatus(models.TextChoices):
    requested = "requested", _("Requested")
    accepted = "accepted", _("Accepted")
    cancelled = "cancelled", _("Cancelled")
    refused = "refused", _("Refused")


class Request(models.Model):
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requests_asrequester",
    )
    expected_at = models.DateTimeField(null=True, blank=True)
    expected_with = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requests_asexpected",
    )

    beneficiary = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requests_asbeneficiary",
    )

    type = models.CharField(choices=Type, default=Type.online)
    reason = models.ForeignKey(
        Reason, on_delete=models.PROTECT, related_name="reasons", null=True, blank=True
    )
    comment = models.TextField(null=True, blank=True)

    refused_reason = models.TextField(null=True, blank=True)
    status = models.CharField(
        choices=RequestStatus.choices, default=RequestStatus.requested
    )

    appointment = models.OneToOneField(
        Appointment, on_delete=models.SET_NULL, null=True, blank=True
    )
    consultation = models.OneToOneField(
        Consultation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="request",
    )


class BookingSlot(models.Model):
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="slots"
    )
    start_time = models.TimeField(default=time(8))
    end_time = models.TimeField(default=time(18))

    start_break = models.TimeField(default=time(12), null=True, blank=True)
    end_break = models.TimeField(default=time(14), null=True, blank=True)

    monday = models.BooleanField()
    tuesday = models.BooleanField()
    wednesday = models.BooleanField()
    thursday = models.BooleanField()
    friday = models.BooleanField()
    saturday = models.BooleanField()
    sunday = models.BooleanField()

    valid_until = models.DateField(
        help_text=_("Slot valid until this date"), blank=True, null=True
    )


class PrescriptionStatus(models.TextChoices):
    draft = "draft", _("Draft")
    prescribed = "prescribed", _("Prescribed")
    dispensed = "dispensed", _("Dispensed")
    cancelled = "cancelled", _("Cancelled")


class Prescription(models.Model):
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.CASCADE,
        related_name="prescriptions",
        verbose_name=_("consultation"),
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, verbose_name=_("created by")
    )

    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    prescribed_at = models.DateTimeField(_("prescribed at"), null=True, blank=True)

    status = models.CharField(
        _("status"),
        choices=PrescriptionStatus.choices,
        default=PrescriptionStatus.draft,
        max_length=20,
    )

    medication_name = models.CharField(_("medication name"), max_length=200)
    dosage = models.CharField(_("dosage"), max_length=100)
    frequency = models.CharField(_("frequency"), max_length=100)
    duration = models.CharField(_("duration"), max_length=100, null=True, blank=True)

    instructions = models.TextField(_("instructions"), null=True, blank=True)
    notes = models.TextField(_("notes"), null=True, blank=True)

    class Meta:
        verbose_name = _("prescription")
        verbose_name_plural = _("prescriptions")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Prescription #{self.pk} - {self.medication_name} for {self.patient}"


class CustomFieldType(models.TextChoices):
    short_text = "short_text", _("Short text")
    long_text = "long_text", _("Long text")
    date = "date", _("Date")
    number = "number", _("Number")
    list = "list", _("List")


class CustomFieldModel(models.TextChoices):
    health_metric = "users.HealthMetric", _("Health Metric")
    request = "consultations.Request", _("Request")
    consultation = "consultations.Consultation", _("Consultation")
    patient = "users.User", _("Patient")


class CustomField(models.Model):
    name = models.CharField(_("name"), max_length=255)
    field_type = models.CharField(
        _("type"), max_length=20, choices=CustomFieldType.choices
    )
    target_model = models.CharField(
        _("target model"), max_length=50, choices=CustomFieldModel.choices
    )
    options = models.JSONField(
        _("options"),
        null=True,
        blank=True,
        help_text=_("List of options for 'list' type"),
    )
    required = models.BooleanField(_("required"), default=False)
    ordering = models.IntegerField(_("ordering"), default=0)

    class Meta:
        verbose_name = _("custom field")
        verbose_name_plural = _("custom fields")
        ordering = ["ordering", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_target_model_display()})"


class CustomFieldValue(models.Model):
    custom_field = models.ForeignKey(
        CustomField, on_delete=models.CASCADE, related_name="values"
    )
    content_type = models.ForeignKey(
        "contenttypes.ContentType", on_delete=models.CASCADE
    )
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    value = models.TextField(_("value"), null=True, blank=True)

    class Meta:
        verbose_name = _("custom field value")
        verbose_name_plural = _("custom field values")
        unique_together = ("custom_field", "content_type", "object_id")
