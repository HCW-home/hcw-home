from datetime import timedelta
from zoneinfo import available_timezones

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from users.models import CommunicationMethod, Language, Speciality

from .models import (
    Appointment,
    AppointmentStatus,
    BookingSlot,
    Consultation,
    CustomField,
    CustomFieldValue,
    Message,
    Participant,
    Queue,
    Reason,
    Request,
)

User = get_user_model()


class CustomFieldValueReadSerializer(serializers.Serializer):
    field = serializers.IntegerField(source="custom_field_id")
    field_name = serializers.CharField(source="custom_field.name", read_only=True)
    field_type = serializers.CharField(source="custom_field.field_type", read_only=True)
    value = serializers.CharField(allow_null=True, allow_blank=True)
    options = serializers.JSONField(source="custom_field.options", read_only=True)


class CustomFieldValueWriteSerializer(serializers.Serializer):
    field = serializers.IntegerField()
    value = serializers.CharField(allow_null=True, allow_blank=True)


class CustomFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomField
        fields = [
            "id",
            "name",
            "field_type",
            "target_model",
            "required",
            "options",
            "ordering",
        ]


class CustomFieldsMixin(serializers.Serializer):
    """Mixin to add custom_fields read/write support to any model serializer."""

    custom_fields = CustomFieldValueReadSerializer(
        many=True, read_only=True, source="custom_field_values"
    )

    def _get_content_type(self, model_class):
        return ContentType.objects.get_for_model(model_class)

    def _save_custom_fields(self, instance, custom_fields_data):
        if custom_fields_data is None:
            return
        ct = self._get_content_type(instance.__class__)
        for item in custom_fields_data:
            CustomFieldValue.objects.update_or_create(
                custom_field_id=item["field"],
                content_type=ct,
                object_id=instance.pk,
                defaults={"value": item.get("value")},
            )

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "custom_fields" in data:
            write_serializer = CustomFieldValueWriteSerializer(
                data=data["custom_fields"], many=True
            )
            write_serializer.is_valid(raise_exception=True)
            ret["_custom_fields_data"] = write_serializer.validated_data
        return ret

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ct = self._get_content_type(instance.__class__)
        values = CustomFieldValue.objects.filter(
            content_type=ct, object_id=instance.pk
        ).select_related("custom_field")
        ret["custom_fields"] = CustomFieldValueReadSerializer(values, many=True).data
        return ret

    def create(self, validated_data):
        custom_fields_data = validated_data.pop("_custom_fields_data", None)
        instance = super().create(validated_data)
        self._save_custom_fields(instance, custom_fields_data)
        return instance

    def update(self, instance, validated_data):
        custom_fields_data = validated_data.pop("_custom_fields_data", None)
        instance = super().update(instance, validated_data)
        self._save_custom_fields(instance, custom_fields_data)
        return instance


class ConsultationSpecialitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Speciality
        fields = ["id", "name"]


class ConsultationUserSerializer(serializers.ModelSerializer):
    specialities = ConsultationSpecialitySerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "mobile_phone_number",
            "last_name",
            "picture",
            "is_online",
            "languages",
            "preferred_language",
            "communication_method",
            "timezone",
            "temporary",
            "specialities",
        ]
        read_only_field = fields


class QueueSerializer(serializers.ModelSerializer):
    users = ConsultationUserSerializer(many=True, read_only=True)

    class Meta:
        model = Queue
        fields = ["id", "name", "users"]


class ParticipantReadSerializer(serializers.ModelSerializer):
    user = ConsultationUserSerializer(read_only=True)
    status = serializers.CharField(read_only=True)
    requires_manual_access = serializers.SerializerMethodField()

    class Meta:
        model = Participant
        fields = [
            "id",
            "user",
            "status",
            "is_active",
            "is_confirmed",
            "is_invited",
            "is_notified",
            "requires_manual_access",
        ]
        read_only_fields = fields

    def get_requires_manual_access(self, obj):
        """Indique si ce participant nécessite un accès manuel (lien d'invitation)"""
        if not obj.user:
            return False
        return obj.user.temporary and not obj.user.email and not obj.user.mobile_phone_number


class ParticipantSerializer(serializers.Serializer):
    first_name = serializers.CharField(
        write_only=True,
        required=False,
    )
    last_name = serializers.CharField(
        write_only=True,
        required=False,
    )
    email = serializers.EmailField(
        write_only=True,
        required=False,
    )
    mobile_phone_number = serializers.CharField(
        write_only=True,
        required=False,
    )
    communication_method = serializers.ChoiceField(
        choices=CommunicationMethod.values,
        write_only=True,
        required=False,
    )
    preferred_language = serializers.ChoiceField(
        choices=settings.LANGUAGES,
        write_only=True,
        required=False,
    )
    timezone = serializers.ChoiceField(
        choices=[(tz, tz) for tz in sorted(available_timezones())],
        write_only=True,
        required=False,
    )

    class Meta:
        fields = [
            "is_active",
            "status",
            "email",
            "mobile_phone_number",
            "timezone",
            "first_name",
            "last_name",
            "communication_method",
            "preferred_language",
        ]

        read_only_fields = ["status", "is_active"]

    def validate(self, attrs):
        provided_fields = [
            attrs.get("mobile_phone_number"),
            attrs.get("email"),
        ]
        provided_count = sum(1 for field in provided_fields if field)

        if provided_count > 1:
            raise serializers.ValidationError(
                _("Only one of phone or email can be provided.")
            )

        communication_method = attrs.get("communication_method")
        if communication_method == "email" and not attrs.get("email"):
            raise serializers.ValidationError(
                {
                    "email": _(
                        "An email is required when communication method is Email."
                    )
                }
            )

        if communication_method in ("sms", "whatsapp") and not attrs.get(
            "mobile_phone_number"
        ):
            raise serializers.ValidationError(
                {
                    "mobile_phone_number": _(
                        "A phone number is required when communication method is SMS or WhatsApp."
                    )
                }
            )

        return super().validate(attrs)


class ConsultationSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    created_by = ConsultationUserSerializer(read_only=True)
    owned_by = ConsultationUserSerializer(read_only=True)
    owned_by_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="owned_by",
        write_only=True,
        required=False,
        allow_null=True,
    )
    beneficiary = ConsultationUserSerializer(read_only=True)
    beneficiary_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="beneficiary",
        write_only=True,
        required=False,
        allow_null=True,
    )
    group = QueueSerializer(read_only=True)
    group_id = serializers.PrimaryKeyRelatedField(
        queryset=Queue.objects.all(),
        source="group",
        write_only=True,
        required=False,
        allow_null=True,
    )
    next_appointment = serializers.SerializerMethodField()
    appointments = serializers.SerializerMethodField()

    class Meta:
        model = Consultation
        fields = [
            "id",
            "created_at",
            "updated_at",
            "beneficiary",
            "beneficiary_id",
            "created_by",
            "owned_by",
            "owned_by_id",
            "group",
            "group_id",
            "description",
            "title",
            "closed_at",
            "visible_by_patient",
            "next_appointment",
            "appointments",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "created_by",
            "closed_at",
            "next_appointment",
            "appointments",
        ]

    def get_next_appointment(self, obj):
        """Get the next non-cancelled appointment for this consultation."""
        next_appt = (
            obj.appointments.exclude(status=AppointmentStatus.cancelled)
            .filter(scheduled_at__gte=timezone.now())
            .order_by("scheduled_at")
            .first()
        )

        if next_appt:
            return AppointmentSerializer(next_appt, context=self.context).data
        return None

    def get_appointments(self, obj):
        """Get all non-cancelled appointments scheduled after two hours ago."""
        two_hours_ago = timezone.now() - timedelta(hours=2)
        appts = (
            obj.appointments.exclude(status=AppointmentStatus.cancelled)
            .filter(scheduled_at__gte=two_hours_ago)
            .order_by("scheduled_at")
        )
        return AppointmentSerializer(appts, many=True, context=self.context).data


class AppointmentSerializer(serializers.ModelSerializer):
    created_by = ConsultationUserSerializer(read_only=True)
    consultation_id = serializers.IntegerField(required=False, allow_null=True)
    consultation_title = serializers.CharField(
        source="consultation.title", read_only=True, default=None
    )
    participants = ParticipantReadSerializer(
        many=True, read_only=True, required=False, source="participant_set"
    )
    participants_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )

    temporary_participants = ParticipantSerializer(
        many=True, allow_null=True, write_only=True, required=False
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "scheduled_at",
            "end_expected_at",
            "type",
            "title",
            "consultation_id",
            "consultation_title",
            "created_by",
            "status",
            "created_at",
            "participants",
            "participants_ids",
            "temporary_participants",
        ]
        read_only_fields = ["id", "created_by", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")

        if request and request.user.is_authenticated:
            user_tz = request.user.user_tz

            # Convert datetime fields to user timezone
            if data.get("scheduled_at"):
                dt = timezone.datetime.fromisoformat(
                    data["scheduled_at"].replace("Z", "+00:00")
                )
                data["scheduled_at"] = dt.astimezone(user_tz).isoformat()

            if data.get("end_expected_at"):
                dt = timezone.datetime.fromisoformat(
                    data["end_expected_at"].replace("Z", "+00:00")
                )
                data["end_expected_at"] = dt.astimezone(user_tz).isoformat()

            if data.get("created_at"):
                dt = timezone.datetime.fromisoformat(
                    data["created_at"].replace("Z", "+00:00")
                )
                data["created_at"] = dt.astimezone(user_tz).isoformat()

        return data

    def validate_scheduled_at(self, value):
        user = self.context["request"].user

        # Convert naive datetime from user timezone to UTC
        value = value.replace(tzinfo=user.user_tz)
        if timezone.is_naive(value):
            value = value.replace(tzinfo=user.user_tz)

        if value < timezone.now():
            raise serializers.ValidationError(
                _("Scheduled time cannot be in the past.")
            )
        return value

    def end_expected_at_at(self, value):
        user = self.context["request"].user

        # Convert naive datetime from user timezone to UTC
        value = value.replace(tzinfo=user.user_tz)
        if timezone.is_naive(value):
            value = value.replace(tzinfo=user.user_tz)

        if value < timezone.now():
            raise serializers.ValidationError(
                _("End expected at time cannot be in the past.")
            )
        return value

    def update(self, instance, validated_data):
        temporary_participants_data = validated_data.pop("temporary_participants", None)
        participants_ids = validated_data.pop("participants_ids", None)

        appointment = super().update(instance, validated_data)

        if participants_ids is not None:
            # Get existing active participants
            existing_participants = Participant.objects.filter(
                appointment=appointment, is_active=True
            )
            existing_users = set(
                existing_participants.values_list("user_id", flat=True)
            )
            new_users = set(user.id for user in participants_ids)

            # Add new participants or reactivate existing ones
            for user_id in new_users - existing_users:
                participant, created = Participant.objects.get_or_create(
                    appointment=appointment,
                    user_id=user_id,
                    defaults={"is_active": True},
                )

                if not created and not participant.is_active:
                    participant.is_active = True
                    participant.is_notified = False
                    participant.save(update_fields=["is_active", "is_notified"])

            # Deactivate removed participants
            removed_users = existing_users - new_users
            if removed_users:
                participants_to_deactivate = Participant.objects.filter(
                    appointment=appointment, user_id__in=removed_users, is_active=True
                )
                for participant in participants_to_deactivate:
                    participant.is_active = False
                    participant.save(update_fields=["is_active"])

        if temporary_participants_data is not None:
            for temp_participant in temporary_participants_data:
                user_defaults = {
                    "first_name": temp_participant.get("first_name", ""),
                    "last_name": temp_participant.get("last_name", ""),
                    "communication_method": temp_participant.get(
                        "communication_method", CommunicationMethod.email
                    ),
                    "preferred_language": temp_participant.get(
                        "preferred_language"
                    ),
                    "timezone": temp_participant.get("timezone", "UTC"),
                    "temporary": True,
                }

                if temp_participant.get("mobile_phone_number"):
                    user, _ = User.objects.get_or_create(
                        mobile_phone_number=temp_participant["mobile_phone_number"],
                        defaults=user_defaults,
                    )
                elif temp_participant.get("email"):
                    user, _ = User.objects.get_or_create(
                        email=temp_participant["email"],
                        defaults=user_defaults,
                    )
                else:
                    # Manual contact: create user directly (no lookup key)
                    user = User.objects.create(**user_defaults)

                participant, created = Participant.objects.get_or_create(
                    appointment=appointment, user=user, defaults={"is_active": True}
                )

                if not created and not participant.is_active:
                    participant.is_active = True
                    participant.is_notified = False
                    participant.save(update_fields=["is_active", "is_notified"])

        return appointment


class AppointmentCreateSerializer(AppointmentSerializer):
    dont_invite_beneficiary = serializers.BooleanField(required=False)
    dont_invite_practitioner = serializers.BooleanField(required=False)
    dont_invite_me = serializers.BooleanField(required=False)

    _consultation = None

    class Meta:
        model = Appointment
        fields = AppointmentSerializer.Meta.fields + [
            "dont_invite_beneficiary",
            "dont_invite_practitioner",
            "dont_invite_me",
        ]
        read_only_fields = AppointmentSerializer.Meta.read_only_fields

    @property
    def consultation(self) -> Consultation | None:
        if not self._consultation:
            consultation_id = self.validated_data.get("consultation_id", None)
            if consultation_id is None:
                return None
            try:
                self._consultation = Consultation.objects.get(id=consultation_id)
            except Consultation.DoesNotExist:
                raise serializers.ValidationError(
                    {"consultation_id": "Consultation not found."}
                )
        return self._consultation

    def validate(self, attrs):
        dont_invite_beneficiary = attrs.get("dont_invite_beneficiary", False)
        dont_invite_practitioner = attrs.get("dont_invite_practitioner", False)
        dont_invite_me = attrs.get("dont_invite_me", False)
        status = attrs.get("status", AppointmentStatus.draft)
        participants_ids = attrs.get("participants_ids", [])
        temporary_participants = attrs.get("temporary_participants", [])

        # Count auto-invited users
        invited_count = 0
        if not dont_invite_beneficiary:
            invited_count += 1
        if not dont_invite_practitioner:
            invited_count += 1
        if not dont_invite_me:
            invited_count += 1

        # Count manual participants
        invited_count += len(participants_ids)
        invited_count += len(temporary_participants)

        if invited_count < 2 and status == AppointmentStatus.scheduled:
            raise serializers.ValidationError(
                _("At least 2 participants are required for an appointment.")
            )

        return super().validate(attrs)

    def create(self, validated_data):
        temporary_participants_data = validated_data.pop("temporary_participants", [])
        participants_ids = validated_data.pop("participants_ids", [])
        dont_invite_beneficiary = validated_data.pop("dont_invite_beneficiary", False)
        dont_invite_practitioner = validated_data.pop("dont_invite_practitioner", False)
        dont_invite_me = validated_data.pop("dont_invite_me", False)

        validated_data["created_by"] = self.context["request"].user
        validated_data["status"] = AppointmentStatus.draft

        appointment = Appointment.objects.create(**validated_data)

        participant_users = set()

        # Users from consultation
        if self.consultation:
            if not dont_invite_beneficiary and self.consultation.beneficiary:
                participant_users.add(self.consultation.beneficiary)

            if not dont_invite_practitioner and self.consultation.owned_by:
                participant_users.add(self.consultation.owned_by)

        if not dont_invite_me:
            participant_users.add(self.context["request"].user)

        # Create participants from consultation
        for participant_user in participant_users:
            Participant.objects.create(
                appointment=appointment,
                user=participant_user,
            )

        # Users from participants_ids
        for user in participants_ids:
            if user not in participant_users:
                Participant.objects.create(appointment=appointment, user=user)
                participant_users.add(user)

        # Users from temporary_participants
        for temp_participant in temporary_participants_data:
            user_defaults = {
                "first_name": temp_participant.get("first_name", ""),
                "last_name": temp_participant.get("last_name", ""),
                "communication_method": temp_participant.get(
                    "communication_method", CommunicationMethod.email
                ),
                "preferred_language": temp_participant.get("preferred_language"),
                "timezone": temp_participant.get("timezone", "UTC"),
                "temporary": True,
            }

            if temp_participant.get("mobile_phone_number"):
                user, _ = User.objects.get_or_create(
                    mobile_phone_number=temp_participant["mobile_phone_number"],
                    defaults=user_defaults,
                )
            elif temp_participant.get("email"):
                user, _ = User.objects.get_or_create(
                    email=temp_participant["email"],
                    defaults=user_defaults,
                )
            else:
                # Manual contact: create user directly (no lookup key)
                user = User.objects.create(**user_defaults)

            if user not in participant_users:
                Participant.objects.create(appointment=appointment, user=user)
                participant_users.add(user)

        appointment.status = AppointmentStatus.scheduled
        appointment.save(update_fields=["status"])

        return appointment


class AttachmentMetadataSerializer(serializers.Serializer):
    file_name = serializers.CharField()
    mime_type = serializers.CharField()


class ConsultationMessageSerializer(serializers.ModelSerializer):
    created_by = ConsultationUserSerializer(default=serializers.CurrentUserDefault())
    # consultation = serializers.PrimaryKeyRelatedField(read_only=True)
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "content",
            "attachment",
            "recording_url",
            "created_at",
            "updated_at",
            "created_by",
            "is_edited",
            "deleted_at",
        ]

    @extend_schema_field(AttachmentMetadataSerializer(allow_null=True))
    def get_attachment(self, obj):
        """Return attachment metadata if attachment exists."""
        if obj.attachment:
            import mimetypes
            import os

            file_name = os.path.basename(obj.attachment.name)
            mime_type = (
                mimetypes.guess_type(obj.attachment.name)[0]
                or "application/octet-stream"
            )

            return {"file_name": file_name, "mime_type": mime_type}
        return None


class ConsultationMessageCreateSerializer(ConsultationMessageSerializer):
    attachment = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "content",
            "attachment",
            "created_at",
            "updated_at",
            "created_by",
            "is_edited",
            "deleted_at",
        ]


class ConsultationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Consultation
        fields = ["id", "group", "beneficiary", "description", "title"]
        read_only_fields = ["id"]


class ReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reason
        fields = ["id", "name", "duration", "assignment_method"]


class BookingSlotSerializer(serializers.ModelSerializer):
    user = ConsultationUserSerializer(read_only=True)

    class Meta:
        model = BookingSlot
        fields = [
            "id",
            "user",
            "start_time",
            "end_time",
            "start_break",
            "end_break",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
            "valid_until",
        ]
        read_only_fields = ["id", "user", "created_by"]

    def create(self, validated_data):
        request_user = self.context["request"].user
        validated_data["user"] = request_user
        validated_data["created_by"] = request_user
        return super().create(validated_data)


class AppointmentDetailSerializer(serializers.ModelSerializer):
    created_by = ConsultationUserSerializer(read_only=True)
    consultation = ConsultationSerializer(read_only=True)
    participants = ParticipantReadSerializer(
        many=True, read_only=True, source="participant_set"
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "scheduled_at",
            "end_expected_at",
            "type",
            "consultation",
            "created_by",
            "status",
            "created_at",
            "participants",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")

        if request and request.user.is_authenticated:
            user_tz = request.user.user_tz

            # Convert datetime fields to user timezone
            if data.get("scheduled_at"):
                dt = timezone.datetime.fromisoformat(
                    data["scheduled_at"].replace("Z", "+00:00")
                )
                data["scheduled_at"] = dt.astimezone(user_tz).isoformat()

            if data.get("end_expected_at"):
                dt = timezone.datetime.fromisoformat(
                    data["end_expected_at"].replace("Z", "+00:00")
                )
                data["end_expected_at"] = dt.astimezone(user_tz).isoformat()

            if data.get("created_at"):
                dt = timezone.datetime.fromisoformat(
                    data["created_at"].replace("Z", "+00:00")
                )
                data["created_at"] = dt.astimezone(user_tz).isoformat()

        return data


class RequestSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    created_by = ConsultationUserSerializer(read_only=True)
    expected_with = ConsultationUserSerializer(read_only=True)
    consultation = serializers.SerializerMethodField()
    appointment = serializers.SerializerMethodField()
    reason = ReasonSerializer(read_only=True)
    reason_id = serializers.IntegerField(write_only=True)
    expected_with_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Request
        fields = [
            "id",
            "expected_at",
            "expected_with",
            "expected_with_id",
            "reason",
            "reason_id",
            "created_by",
            "comment",
            "status",
            "refused_reason",
            "appointment",
            "consultation",
        ]
        read_only_fields = ["id", "created_by", "status"]

    def create(self, validated_data):
        reason_id = validated_data.pop("reason_id")
        expected_with_id = validated_data.pop("expected_with_id", None)

        try:
            reason = Reason.objects.get(id=reason_id, is_active=True)
            validated_data["reason"] = reason
        except Reason.DoesNotExist:
            raise serializers.ValidationError(
                "This reason does not exist or is not active."
            )

        if expected_with_id:
            try:
                expected_with = User.objects.get(id=expected_with_id)
                validated_data["expected_with"] = expected_with
            except User.DoesNotExist:
                raise serializers.ValidationError(
                    "The specified doctor does not exist."
                )

        user = self.context["request"].user
        validated_data["created_by"] = user

        return super().create(validated_data)

    def get_appointment(self, obj):
        """Only return appointment if scheduled within the last 2 hours."""
        if obj.appointment:
            two_hours_ago = timezone.now() - timedelta(hours=2)
            if obj.appointment.scheduled_at >= two_hours_ago:
                return AppointmentSerializer(obj.appointment, context=self.context).data
        return None

    def get_consultation(self, obj):
        """Only return consultation data if visible_by_patient is True."""
        if obj.consultation and obj.consultation.visible_by_patient:
            return ConsultationSerializer(obj.consultation, context=self.context).data
        return None


# class AppointmentFHIRSerializer(serializers.Serializer):
#     """
#     Serializer that converts Appointment model to FHIR Appointment resource format
#     """

#     def to_representation(self, instance):
#         """Convert Django Appointment to FHIR Appointment resource"""

#         # Map status
#         status_mapping = {
#             "Draft": "pending",
#             "Scheduled": "booked",
#             "Cancelled": "cancelled",
#         }
#         fhir_status = status_mapping.get(instance.status, "pending")

#         # Build FHIR Appointment
#         fhir_appointment = FHIRAppointment(
#             resourceType="Appointment",
#             id=str(instance.id),
#             status=fhir_status,
#             start=instance.scheduled_at.isoformat() if instance.scheduled_at else None,
#             end=instance.end_expected_at.isoformat()
#             if instance.end_expected_at
#             else None,
#             created=instance.created_at.isoformat() if instance.created_at else None,
#         )

#         # Add appointment type
#         if instance.type:
#             appointment_type = CodeableConcept(
#                 coding=[
#                     Coding(
#                         system="http://terminology.hl7.org/CodeSystem/v2-0276",
#                         code="ROUTINE" if instance.type == "Online" else "WALKIN",
#                         display=instance.type,
#                     )
#                 ]
#             )
#             fhir_appointment.appointmentType = appointment_type

#         # Add participants
#         participants = []
#         for participant in instance.participants.all():
#             fhir_participant = {
#                 "actor": {
#                     "reference": f"Patient/{participant.user.id}"
#                     if participant.user
#                     else None,
#                     "display": participant.name
#                     if hasattr(participant, "name")
#                     else participant.email,
#                 },
#                 "status": "accepted" if participant.is_confirmed else "tentative",
#             }
#             participants.append(fhir_participant)

#         if participants:
#             fhir_appointment.participant = participants

#         # Add description from consultation if available
#         if instance.consultation:
#             fhir_appointment.description = (
#                 instance.consultation.description or instance.consultation.title
#             )

#         # Convert to dict for JSON serialization
#         return fhir_appointment.dict(exclude_none=True)


class ParticipantDetailSerializer(ParticipantSerializer):
    appointment = AppointmentDetailSerializer(read_only=True)

    class Meta:
        model = Participant
        fields = ParticipantSerializer.Meta.fields + ["appointment"]
