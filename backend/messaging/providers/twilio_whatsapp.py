import base64
import json
from typing import TYPE_CHECKING, Any, Dict, Tuple

import requests

from . import BaseMessagingProvider


class ProviderException(Exception): ...


if TYPE_CHECKING:
    from ..models import Message, TemplateValidation


class Main(BaseMessagingProvider):
    display_name = "Twilio WhatsApp"
    communication_method = "whatsapp"
    required_fields = [
        "account_sid",
        "auth_token",
        "from_phone",
        "excluded_prefixes",
        "included_prefixes",
    ]

    def _get_auth_header(self):
        account_sid = self.messaging_provider.account_sid
        auth_token = self.messaging_provider.auth_token
        if not account_sid or not auth_token:
            return None
        credentials = f"{account_sid}:{auth_token}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"

    def send(self, message: "Message"):
        if not message.recipient_phone:
            raise ProviderException("Missing recipient phone")

        if not self.messaging_provider.matches_phone_prefix(message.recipient_phone):
            raise ProviderException(
                f"Unable to send, phone is not matching prefix {message.recipient_phone}"
            )

        auth_header = self._get_auth_header()
        if not auth_header:
            raise ProviderException("No authentication header")

        account_sid = self.messaging_provider.account_sid

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        data = {
            "From": self.messaging_provider.from_phone,
            "To": message.recipient_phone,
            "Body": message.content,
        }

        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/x-www-form-urlencoded",
        }

        response = requests.post(url, data=data, headers=headers)

        message.task_logs += response.text

    def test_connection(self) -> Tuple[bool, Any]:
        try:
            auth_header = self._get_auth_header()
            if not auth_header:
                return (False, "Missing account_sid or auth_token")

            from_whatsapp = self.messaging_provider.from_phone
            if not from_whatsapp:
                return (False, "Missing from_phone")

            account_sid = self.messaging_provider.account_sid
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json"

            headers = {"Authorization": auth_header}
            response = requests.get(url, headers=headers)

            if response.status_code == 200:
                return (True, True)
            else:
                return (False, f"Twilio API error: {response.status_code}")

        except Exception as e:
            return (False, str(e))

    def validate_template(
        self, template_validation: "TemplateValidation"
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Submit a WhatsApp template for validation with Twilio

        Args:
            template (Template): The template to validate

        Returns:
            Tuple[bool, str, Dict[str, Any]]: (success, external_template_id, response_data)
        """
        auth_header = self._get_auth_header()
        url = "https://content.twilio.com/v1/Content"

        # Prepare template data for Twilio Content API
        # Note: This is a simplified example - you may need to adjust based on your template structure
        content_data = {
            "friendly_name": template_validation.event_type,
            "language": template_validation.language_code,
            "variables": {},
            "types": {
                "twilio/text": {
                    "body": str(template_validation.template.template_content)
                }
            },
        }

        # If there's a subject, add it as a header
        if template_validation.template.template_subject:
            content_data["types"]["twilio/text"]["header"] = str(
                template_validation.template.template_subject
            )

        headers = {"Authorization": auth_header, "Content-Type": "application/json"}

        response = requests.post(url, json=content_data, headers=headers)
        response_data = response.json() if response.content else {}

        from ..models import TemplateValidationStatus

        template_validation.validation_response = response_data
        template_validation.external_template_id = response_data["sid"]
        template_validation.status = TemplateValidationStatus.pending
        template_validation.save()

    def check_template_validation(
        self, template_validation: "TemplateValidation"
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Check the validation status of a WhatsApp template with Twilio

        Args:
            external_template_id (str): The Twilio Content SID

        Returns:
            Tuple[bool, str, Dict[str, Any]]: (is_validated, status, response_data)
        """

        auth_header = self._get_auth_header()

        url = f"https://content.twilio.com/v1/Content/{template_validation.external_template_id}"

        headers = {"Authorization": auth_header}
        response = requests.get(url, headers=headers)
        response_data = response.json() if response.content else {}

        # Get the status from the response
        # Twilio Content API returns status in different ways depending on the template state
        status = response_data.get("status", "unknown").lower()

        from ..models import TemplateValidationStatus

        # Map Twilio statuses to our understanding
        if status in ["approved", "active"]:
            template_validation.status = TemplateValidationStatus.validated
        elif status in ["pending", "in_review"]:
            template_validation.status = TemplateValidationStatus.pending
        elif status in ["rejected", "failed"]:
            template_validation.status = TemplateValidationStatus.rejected
        else:
            template_validation.status = TemplateValidationStatus.unused
