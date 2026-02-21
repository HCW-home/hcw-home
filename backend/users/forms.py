from allauth.account import app_settings as allauth_account_settings
from allauth.account.adapter import get_adapter
from allauth.account.forms import default_token_generator
from allauth.account.utils import (
    filter_users_by_email,
    user_pk_to_url_str,
    user_username,
)
from allauth.utils import build_absolute_uri
from dj_rest_auth.app_settings import api_settings
from dj_rest_auth.forms import DefaultPasswordResetForm, default_url_generator
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.sites.shortcuts import get_current_site
from django.urls import reverse
from messaging.models import Message


class CustomAllAuthPasswordResetForm(DefaultPasswordResetForm):
    def save(self, request, **kwargs):
        current_site = get_current_site(request)
        token_generator = kwargs.get("token_generator", default_token_generator)

        for user in self.users:
            temp_key = token_generator.make_token(user)

            # save it to the password reset model
            # password_reset = PasswordReset(user=user, temp_key=temp_key)
            # password_reset.save()

            # send the password reset email
            uid = user_pk_to_url_str(user)

            context = {
                "current_site": current_site,
                "user": user,
                "request": request,
                "token": temp_key,
                "uid": uid,
            }
            if (
                getattr(allauth_account_settings, "LOGIN_METHODS", None)  # noqa: W504
                and allauth_account_settings.AuthenticationMethod.EMAIL
                not in allauth_account_settings.LOGIN_METHODS
            ):
                context["username"] = user_username(user)
            elif (
                allauth_account_settings.AUTHENTICATION_METHOD
                != allauth_account_settings.AuthenticationMethod.EMAIL
            ):
                # AUTHENTICATION_METHOD is deprecated
                context["username"] = user_username(user)

            user.one_time_auth_token = None
            user.save(update_fields=["one_time_auth_token"])

            message = Message.objects.create(
                sent_to=user,
                template_system_name="reset_password",
                content_type=ContentType.objects.get_for_model(user),
                object_id=user.pk,
                in_notification=False,
                additionnal_link_args={"token": temp_key, "uid": uid},
            )
        return self.cleaned_data["email"]
