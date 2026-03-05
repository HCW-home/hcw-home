import base64
import json
import logging
import re
from typing import TYPE_CHECKING, Any, Dict, Tuple

import requests

from . import BaseMessagingProvider

logger = logging.getLogger(__name__)


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

    def _get_factory_for_model(self, model_string: str):
        """
        Get the factory class for a given model string (e.g., 'consultations.Participant')

        Args:
            model_string: The model string in format 'app_label.ModelName'

        Returns:
            Factory class or None if not found
        """
        logger.info(f"Looking for factory for model: {model_string}")

        factory_mapping = {
            'consultations.Participant': 'consultations.factories.ParticipantFactory',
            'consultations.Appointment': 'consultations.factories.AppointmentFactory',
            'consultations.Consultation': 'consultations.factories.ConsultationFactory',
            'consultations.Message': 'consultations.factories.MessageFactory',
            'users.User': 'users.factories.UserFactory',
        }

        factory_path = factory_mapping.get(model_string)
        if not factory_path:
            logger.warning(f"No factory mapping found for model: {model_string}")
            return None

        module_path, factory_name = factory_path.rsplit('.', 1)
        try:
            module = __import__(module_path, fromlist=[factory_name])
            factory = getattr(module, factory_name)
            logger.info(f"Successfully loaded factory: {factory_name}")
            return factory
        except (ImportError, AttributeError) as e:
            logger.error(f"Failed to import factory {factory_name}: {e}")
            return None

    def _generate_template_examples(self, template_validation: "TemplateValidation") -> Dict[str, str]:
        """
        Generate example values for template variables using factories

        Args:
            template_validation: The TemplateValidation instance

        Returns:
            Dictionary mapping variable placeholders ({{1}}, {{2}}, etc.) to example values
        """
        from ..template import DEFAULT_NOTIFICATION_MESSAGES
        from jinja2 import Template as Jinja2Template

        logger.info(f"Generating template examples for event_type: {template_validation.event_type}")

        event_type = template_validation.event_type
        template = template_validation.template

        # Get model info from DEFAULT_NOTIFICATION_MESSAGES
        notification_config = DEFAULT_NOTIFICATION_MESSAGES.get(event_type, {})
        model_string = notification_config.get('model')

        if not model_string:
            logger.warning(f"No model found in notification config for event_type: {event_type}")
            return {}

        # Get the factory for this model
        factory_class = self._get_factory_for_model(model_string)
        if not factory_class:
            logger.warning(f"No factory class found for model: {model_string}")
            return {}

        # Create an example object using the factory (without saving to DB)
        try:
            example_obj = factory_class.build()
            logger.info(f"Successfully created example object: {type(example_obj).__name__}")
        except Exception as e:
            logger.error(f"Failed to build example object: {e}")
            return {}

        # Extract template subject and content for the language
        template_subject = str(getattr(template, f'template_subject_{template_validation.language_code}', '') or template.template_subject or '')
        template_content = str(getattr(template, f'template_content_{template_validation.language_code}', '') or template.template_content)

        logger.debug(f"Template subject: {template_subject[:100]}...")
        logger.debug(f"Template content: {template_content[:100]}...")

        # Combine subject and content to extract all variables (subject first, then body)
        full_template_text = template_subject + '\n' + template_content

        # Extract all variables from the template using regex
        # Match patterns like {{ obj.something }} or {{ object.something }}
        variable_pattern = re.compile(r'\{\{\s*(obj|object)\.([^}|]+?)(?:\|[^}]+)?\s*\}\}')
        variables = variable_pattern.findall(full_template_text)

        logger.info(f"Found {len(variables)} variables in template: {variables}")

        examples = {}
        variable_index = 1

        for var_prefix, var_path in variables:
            # Create a simple Jinja2 template to render this specific variable
            try:
                jinja_template = Jinja2Template(f'{{{{ {var_prefix}.{var_path} }}}}')
                value = jinja_template.render({var_prefix: example_obj, 'obj': example_obj, 'object': example_obj})

                # Store with Twilio's variable format: {{1}}, {{2}}, etc.
                examples[f'{{{{{variable_index}}}}}'] = str(value)
                logger.debug(f"Variable {variable_index}: {var_prefix}.{var_path} = {value}")
                variable_index += 1
            except Exception as e:
                logger.error(f"Failed to render variable {var_prefix}.{var_path}: {e}")
                continue

        logger.info(f"Generated {len(examples)} example values: {examples}")
        return examples

    def _get_auth_header(self):
        account_sid = self.messaging_provider.account_sid
        auth_token = self.messaging_provider.auth_token
        if not account_sid or not auth_token:
            return None
        credentials = f"{account_sid}:{auth_token}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"

    def send(self, message: "Message"):
        if not message.phone_number:
            raise ProviderException("Missing recipient phone")

        if not self.messaging_provider.matches_phone_prefix(message.phone_number):
            raise ProviderException(
                f"Unable to send, phone is not matching prefix {message.phone_number}"
            )

        auth_header = self._get_auth_header()
        if not auth_header:
            raise ProviderException("No authentication header")

        account_sid = self.messaging_provider.account_sid

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        data = {
            "From": self.messaging_provider.from_phone,
            "To": message.phone_number,
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
        from ..template import DEFAULT_NOTIFICATION_MESSAGES

        logger.info(f"Starting template validation for: {template_validation.event_type} (language: {template_validation.language_code})")

        auth_header = self._get_auth_header()
        url = "https://content.twilio.com/v1/Content"

        # Generate example values for template variables
        template_examples = self._generate_template_examples(template_validation)
        logger.info(f"Template examples generated: {template_examples}")

        # Get template content with the appropriate language
        template_content = str(
            getattr(
                template_validation.template,
                f'template_content_{template_validation.language_code}',
                ''
            ) or template_validation.template.template_content
        )

        # Get template subject if it exists
        template_subject = template_validation.template.template_subject
        template_subject_lang = ""
        if template_subject:
            template_subject_lang = str(
                getattr(
                    template_validation.template,
                    f'template_subject_{template_validation.language_code}',
                    ''
                ) or template_subject
            )

        # Check if template has an action (call-to-action template)
        event_config = DEFAULT_NOTIFICATION_MESSAGES.get(template_validation.event_type, {})
        has_action = 'action' in event_config
        action_label = str(event_config.get('action_label', '')) if has_action else ''

        # Truncate action label to 25 characters (Twilio limit)
        if action_label and len(action_label) > 25:
            logger.warning(f"Action label too long ({len(action_label)} chars), truncating to 25 chars")
            action_label = action_label[:25]

        logger.info(f"Template has action: {has_action}")
        if has_action:
            logger.info(f"Action label: {action_label}")

        # Replace Jinja2 variables with Twilio's variable format
        # Replace {{ obj.something }} or {{ object.something }} with {{1}}, {{2}}, etc.
        # Process subject first, then body to maintain correct variable numbering
        variable_index = 1
        def replace_var(match):
            nonlocal variable_index
            replacement = f'{{{{{variable_index}}}}}'
            variable_index += 1
            return replacement

        # Replace variables in subject (if exists)
        template_subject_with_twilio_vars = ""
        if template_subject_lang:
            template_subject_with_twilio_vars = re.sub(
                r'\{\{\s*(obj|object)\.([^}|]+?)(?:\|[^}]+)?\s*\}\}',
                replace_var,
                template_subject_lang
            )

        # Replace variables in body
        template_content_with_twilio_vars = re.sub(
            r'\{\{\s*(obj|object)\.([^}|]+?)(?:\|[^}]+)?\s*\}\}',
            replace_var,
            template_content
        )

        # Prepare template data based on whether it has an action
        if has_action:
            # Use call-to-action template
            logger.info("Preparing call-to-action template")
            content_data = {
                "friendly_name": template_validation.event_type,
                "language": template_validation.language_code,
                "variables": template_examples,
                "types": {
                    "twilio/call-to-action": {
                        "body": template_content_with_twilio_vars,
                        "actions": [
                            {
                                "title": str(action_label),
                                "type": "URL",
                                "url": "https://example.com"  # Dynamic URL will be set at send time
                            }
                        ]
                    }
                },
            }

            # Add header if there's a subject
            if template_subject_with_twilio_vars:
                content_data["types"]["twilio/call-to-action"]["header"] = template_subject_with_twilio_vars
        else:
            # Use regular text template
            logger.info("Preparing text template")
            content_data = {
                "friendly_name": template_validation.event_type,
                "language": template_validation.language_code,
                "variables": template_examples,
                "types": {
                    "twilio/text": {
                        "body": template_content_with_twilio_vars
                    }
                },
            }

            # Add header if there's a subject
            if template_subject_with_twilio_vars:
                content_data["types"]["twilio/text"]["header"] = template_subject_with_twilio_vars

        logger.info(f"Content data to send: {json.dumps(content_data, indent=2)}")

        headers = {"Authorization": auth_header, "Content-Type": "application/json"}

        logger.info(f"Sending POST request to Twilio Content API: {url}")
        response = requests.post(url, json=content_data, headers=headers)
        logger.info(f"Twilio response status: {response.status_code}")
        logger.debug(f"Twilio response content: {response.text}")

        response_data = response.json() if response.content else {}
        logger.info(f"Twilio response data: {json.dumps(response_data, indent=2)}")

        from ..models import TemplateValidationStatus

        template_validation.validation_response = response_data

        # Check if the request was successful
        if response.status_code >= 400:
            logger.error(f"Twilio API error: {response_data.get('message', 'Unknown error')}")
            template_validation.status = TemplateValidationStatus.failed
            template_validation.save()
            logger.info(f"Template validation saved with status: {template_validation.status}")
            return

        template_validation.external_template_id = response_data.get("sid", "")
        logger.info(f"Template external_template_id: {template_validation.external_template_id}")

        # Submit the Content Template to WhatsApp for approval
        if template_validation.external_template_id:
            logger.info("Submitting template to WhatsApp for approval")
            self._submit_template_to_whatsapp(template_validation, auth_header)
        else:
            logger.warning("No external_template_id found, skipping WhatsApp submission")

        template_validation.status = TemplateValidationStatus.pending
        template_validation.save()
        logger.info(f"Template validation saved with status: {template_validation.status}")

    def _submit_template_to_whatsapp(self, template_validation: "TemplateValidation", auth_header: str):
        """
        Submit the created Content Template to WhatsApp for approval

        Args:
            template_validation: The TemplateValidation instance
            auth_header: Authorization header for Twilio API
        """
        content_sid = template_validation.external_template_id
        url = f"https://content.twilio.com/v1/Content/{content_sid}/ApprovalRequests/whatsapp"

        logger.info(f"Submitting template to WhatsApp: content_sid={content_sid}")
        logger.info(f"WhatsApp submission URL: {url}")

        headers = {"Authorization": auth_header, "Content-Type": "application/json"}

        # Submit to WhatsApp
        # Valid categories: UTILITY (transactional), MARKETING, AUTHENTICATION (OTP)
        payload = {
            "name": template_validation.event_type,
            "category": "UTILITY"
        }

        logger.info(f"WhatsApp submission payload: {json.dumps(payload, indent=2)}")

        try:
            response = requests.post(url, json=payload, headers=headers)
            logger.info(f"WhatsApp submission response status: {response.status_code}")
            logger.debug(f"WhatsApp submission response content: {response.text}")

            response_data = response.json() if response.content else {}
            logger.info(f"WhatsApp submission response data: {json.dumps(response_data, indent=2)}")

            # Update validation response with submission info
            if template_validation.validation_response:
                template_validation.validation_response['whatsapp_submission'] = response_data
            else:
                template_validation.validation_response = {'whatsapp_submission': response_data}

            # Check if WhatsApp submission failed
            if response.status_code >= 400:
                from ..models import TemplateValidationStatus
                logger.error(f"WhatsApp submission failed with error: {response_data.get('message', 'Unknown error')}")
                template_validation.status = TemplateValidationStatus.failed
                template_validation.save()
                logger.info("Template validation status set to failed due to WhatsApp submission error")
            else:
                template_validation.save()
                logger.info("WhatsApp submission successful, validation response updated")
        except Exception as e:
            from ..models import TemplateValidationStatus
            logger.error(f"WhatsApp submission failed with exception: {e}", exc_info=True)
            # Set status to failed on exception
            if template_validation.validation_response:
                template_validation.validation_response['whatsapp_submission_error'] = str(e)
            else:
                template_validation.validation_response = {'whatsapp_submission_error': str(e)}
            template_validation.status = TemplateValidationStatus.failed
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

        logger.info(f"Check validation response: {json.dumps(response_data, indent=2)}")

        from ..models import TemplateValidationStatus

        # Get approval requests link from the response
        approval_fetch_url = response_data.get("links", {}).get("approval_fetch")

        status = ""
        if approval_fetch_url:
            # Fetch approval requests to get WhatsApp status
            logger.info(f"Fetching approval requests from: {approval_fetch_url}")
            approval_response = requests.get(approval_fetch_url, headers=headers)
            approval_data = approval_response.json() if approval_response.content else {}
            logger.info(f"Approval requests response: {json.dumps(approval_data, indent=2)}")

            # Get WhatsApp approval status directly from the response
            whatsapp_data = approval_data.get("whatsapp", {})
            status = whatsapp_data.get("status", "").lower()
            logger.info(f"WhatsApp approval status: {status}")
        else:
            logger.warning("No approval_fetch URL found in response")

        if not status:
            logger.warning(f"WhatsApp approval status not found")

        # Map Twilio WhatsApp approval statuses to our understanding
        # Possible statuses: approved, pending, rejected
        if status == "approved":
            template_validation.status = TemplateValidationStatus.validated
            if not template_validation.validated_at:
                from django.utils import timezone
                template_validation.validated_at = timezone.now()
        elif status == "pending":
            template_validation.status = TemplateValidationStatus.pending
        elif status == "rejected":
            template_validation.status = TemplateValidationStatus.rejected
        else:
            # If no WhatsApp approval status found, keep current status or set to created
            logger.warning(f"Unknown or missing WhatsApp approval status: {status}")
            if not template_validation.status or template_validation.status == TemplateValidationStatus.created:
                template_validation.status = TemplateValidationStatus.created

        template_validation.validation_response = response_data
        template_validation.save()
