from typing import TYPE_CHECKING, Any, Tuple

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils.translation import gettext_lazy as _

from . import BaseMessagingProvider

if TYPE_CHECKING:
    from ..models import Message


class Main(BaseMessagingProvider):
    display_name = _("Email over Django SMTP")
    communication_method = "email"
    required_fields = ["from_email"]

    def send(self, message: "Message"):
        from_email = self.messaging_provider.from_email or settings.DEFAULT_FROM_EMAIL
        subject = message.render_subject or "Message from HCW"

        email = EmailMultiAlternatives(
            subject=subject,
            body=message.render_content,
            from_email=from_email,
            to=[message.email],
        )

        email.attach_alternative(message.render_full_html, "text/html")

        # Attach ICS file if available (for appointments)
        ics_data = message.ics_attachment
        if ics_data:
            filename, content, mime_type = ics_data
            email.attach(filename, content, mime_type)

        email.send()

    def test_connection(self):
        if not hasattr(settings, "EMAIL_HOST") or not settings.EMAIL_HOST:
            raise Exception("EMAIL_HOST setting is required")

        from_email = self.messaging_provider.from_email or getattr(
            settings, "DEFAULT_FROM_EMAIL", None
        )
        if not from_email:
            raise Exception("from_email is required")

        connection = get_connection()
        connection.open()
        connection.close()
