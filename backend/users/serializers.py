from allauth.account import app_settings
from allauth.account.adapter import get_adapter
from allauth.account.utils import setup_user_email
from allauth.socialaccount.models import EmailAddress
from consultations.models import Participant
from consultations.serializers import AppointmentDetailSerializer, CustomFieldsMixin
from dj_rest_auth.serializers import PasswordResetSerializer
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, status
from rest_framework.response import Response

from .forms import CustomAllAuthPasswordResetForm
from .models import HealthMetric, Language, Organisation, Speciality, Term

UserModel = get_user_model()


class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = ["id", "name", "code"]


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = ["id", "name", "content", "use_for_patient"]


class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = [
            "id",
            "name",
            "logo_color",
            "logo_white",
            "favicon",
            "footer_patient",
            "footer_practitioner",
            "primary_color",
            "default_term",
            "location",
            "street",
            "city",
            "postal_code",
            "country",
        ]


class UserDetailsSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    """
    User model w/o password
    """

    main_organisation = OrganisationSerializer(read_only=True)
    organisations = OrganisationSerializer(many=True, read_only=True)
    languages = LanguageSerializer(many=True, read_only=True)

    mobile_phone_number = serializers.CharField(allow_null=True, allow_blank=True, required=False)

    languages_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Language.objects.all(),
        write_only=True,
        source="languages",
        required=False,
    )

    class Meta:
        model = UserModel
        fields = [
            "pk",
            UserModel.EMAIL_FIELD,
            "picture",
            "first_name",
            "last_name",
            "app_preferences",
            "last_login",
            "communication_method",
            "mobile_phone_number",
            "timezone",
            "location",
            "main_organisation",
            "organisations",
            "preferred_language",
            "languages_ids",
            "languages",
            "is_online",
            "accepted_term",
            "temporary",
            "is_practitioner",
            "is_first_login",
        ]
        read_only_fields = [
            "is_online",
            "is_practitioner",
            UserModel.EMAIL_FIELD,
        ]

    def validate_temporary(self, value):
        if self.instance and not self.instance.temporary and value:
            raise serializers.ValidationError(
                "A permanent patient cannot be made temporary."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        communication_method = attrs.get(
            "communication_method",
            getattr(self.instance, "communication_method", None),
        )
        phone = attrs.get(
            "mobile_phone_number",
            getattr(self.instance, "mobile_phone_number", None),
        )

        if communication_method in ("sms", "whatsapp") and not phone:
            raise serializers.ValidationError(
                {
                    "mobile_phone_number": _(
                        "A phone number is required when communication method is SMS or WhatsApp."
                    )
                }
            )

        email = attrs.get(
            "email",
            getattr(self.instance, "email", None),
        )

        if communication_method == "email" and not email:
            raise serializers.ValidationError(
                {
                    "email": _(
                        "An email is required when communication method is Email."
                    )
                }
            )

        return attrs


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(
        required=app_settings.SIGNUP_FIELDS["email"]["required"]
    )
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    password1 = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    def validate_email(self, email):
        email = get_adapter().clean_email(email)
        return email

    def validate(self, attrs):
        if attrs.get("password1") != attrs.get("password2"):
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        return attrs

    def get_cleaned_data(self):
        return {
            "password": self.validated_data.get("password1", ""),
            "email": self.validated_data.get("email", ""),
            "first_name": self.validated_data.get("first_name", ""),
            "last_name": self.validated_data.get("last_name", ""),
        }

    def save(self, request):
        self.cleaned_data = self.get_cleaned_data()
        email = self.cleaned_data.get("email", "")

        # If user already exists, silently return existing user
        # to avoid leaking information about registered emails
        existing_user = UserModel.objects.filter(email=email).first()
        if existing_user:
            return existing_user

        adapter = get_adapter()
        user = adapter.new_user(request)
        user = adapter.save_user(request, user, self, commit=False)
        if "password" in self.cleaned_data:
            try:
                adapter.clean_password(self.cleaned_data["password"], user=user)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    detail=serializers.as_serializer_error(exc)
                )
        user.first_name = self.cleaned_data.get("first_name", "")
        user.last_name = self.cleaned_data.get("last_name", "")
        user.save()
        setup_user_email(request, user, [])
        return user


class LoginSerializer(serializers.Serializer):
    """
    Custom login serializer that uses email instead of username
    """

    email = serializers.EmailField(required=True)
    password = serializers.CharField(style={"input_type": "password"}, write_only=True)

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        if email and password:
            user = authenticate(
                request=self.context.get("request"), username=email, password=password
            )

            if not user:
                msg = "Unable to log in with provided credentials."
                raise serializers.ValidationError(msg, code="authorization")
        else:
            msg = 'Must include "email" and "password".'
            raise serializers.ValidationError(msg, code="authorization")

        attrs["user"] = user
        return attrs


class SpecialitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Speciality
        fields = ["id", "name"]


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserModel
        fields = ["id", "email", "first_name", "last_name"]


class HealthMetricSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    created_by = UserSerializer(read_only=True)
    measured_by = UserSerializer(read_only=True)

    class Meta:
        model = HealthMetric
        fields = [
            "id",
            "user",
            "created_by",
            "measured_by",
            "measured_at",
            "source",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "created_by",
            "measured_by",
            "created_at",
            "updated_at",
        ]


class CustomPasswordResetSerializer(PasswordResetSerializer):
    @property
    def password_reset_form_class(self):
        return CustomAllAuthPasswordResetForm


class UserParticipantDetailSerializer(serializers.ModelSerializer):
    appointment = AppointmentDetailSerializer(read_only=True)

    class Meta:
        model = Participant
        fields = [
            "is_confirmed",
            "appointment",
            "status",
        ]
        read_only_field = [
            "status",
            "appointment",
        ]
