from . import BaseMessagingProvider
from typing import TYPE_CHECKING, Tuple, Any
import requests
import logging

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..models import Message, MessageStatus, MessagingProvider

class Main(BaseMessagingProvider):

    display_name = "Clickatel SMS"
    communication_method = "sms"
    required_fields = ['from_phone', 'api_key']
    
    def send(self, message: 'Message'):
        logger.info(f"Sending SMS via Clickatel to {message.phone_number}")

        if not message.phone_number:
            error_msg = "Missing recipient phone number"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        api_key = self.messaging_provider.api_key
        if not api_key:
            error_msg = "Missing Clickatel API key"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        from_number = self.messaging_provider.from_phone
        if not from_number:
            error_msg = "Missing from_phone configuration"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        url = "https://platform.clickatell.com/messages"

        headers = {
            'Authorization': f"Bearer {api_key}",
            'Content-Type': 'application/json'
        }

        data = {
            "messages": [{
                "to": [message.phone_number],
                "from": from_number,
                "text": message.render_content_sms
            }]
        }

        logger.info(f"Sending POST request to Clickatel SMS API: {url}")
        response = requests.post(url, json=data, headers=headers)
        logger.info(f"Clickatel response status: {response.status_code}")

        message.task_logs += f"Clickatel API response: {response.status_code}\n"
        message.task_logs += f"Response body: {response.text}\n"
        message.save()

        if response.status_code in [200, 201, 202]:
            response_data = response.json()
            messages = response_data.get('messages', [])
            if messages and messages[0].get('accepted'):
                logger.info("SMS sent successfully via Clickatel")
                return
            else:
                error_msg = f"Clickatel rejected message: {response_data}"
                logger.error(error_msg)
                raise Exception(error_msg)
        else:
            error_msg = f"Clickatel API error: {response.status_code} - {response.text}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def test_connection(self) -> Tuple[bool, Any]:
        try:
            api_key = self.messaging_provider.api_key
            if not api_key:
                return (False, "Missing api_key")
            
            from_number = self.messaging_provider.from_phone
            if not from_number:
                return (False, "Missing from_phone")
            
            # Test the API by checking the balance endpoint
            url = "https://platform.clickatell.com/account/balance"
            headers = {'Authorization': f"Bearer {api_key}"}
            
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                return (True, True)
            else:
                return (False, f"Clickatel API error: {response.status_code}")
                
        except Exception as e:
            return (False, str(e))