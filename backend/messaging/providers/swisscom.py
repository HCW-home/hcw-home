from . import BaseMessagingProvider
from typing import TYPE_CHECKING, Tuple, Any
import requests
import base64
import logging

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..models import Message, MessageStatus, MessagingProvider

class Main(BaseMessagingProvider):

    display_name = "Swisscom SMS"
    communication_method = "sms"
    required_fields = ['client_id', 'client_secret']
    
    def _get_auth_header(self):
        client_id = self.messaging_provider.client_id
        client_secret = self.messaging_provider.client_secret
        if not client_id or not client_secret:
            return None
        credentials = f"{client_id}:{client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"
    
    def _get_access_token(self):
        auth_header = self._get_auth_header()
        if not auth_header:
            return None
            
        url = "https://consent.swisscom.com/oauth/token"
        headers = {
            'Authorization': auth_header,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        data = {'grant_type': 'client_credentials'}
        
        try:
            response = requests.post(url, headers=headers, data=data)
            if response.status_code == 200:
                return response.json().get('access_token')
        except Exception:
            pass
        return None
    
    def send(self, message: 'Message'):
        logger.info(f"Sending SMS via Swisscom to {message.phone_number}")

        if not message.phone_number:
            error_msg = "Missing recipient phone number"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        access_token = self._get_access_token()
        if not access_token:
            error_msg = "Failed to obtain Swisscom access token"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        sender = self.messaging_provider.sender_id
        if not sender:
            error_msg = "Missing sender_id configuration"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        url = "https://api.swisscom.com/messaging/sms"

        headers = {
            'Authorization': f"Bearer {access_token}",
            'Content-Type': 'application/json'
        }

        data = {
            "from": sender,
            "to": message.phone_number,
            "text": message.render_content_sms
        }

        logger.info(f"Sending POST request to Swisscom SMS API: {url}")
        response = requests.post(url, json=data, headers=headers)
        logger.info(f"Swisscom response status: {response.status_code}")

        message.task_logs += f"Swisscom API response: {response.status_code}\n"
        message.task_logs += f"Response body: {response.text}\n"
        message.save()

        if response.status_code in [200, 201, 202]:
            logger.info("SMS sent successfully via Swisscom")
            return
        else:
            error_msg = f"Swisscom API error: {response.status_code} - {response.text}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def test_connection(self) -> Tuple[bool, Any]:
        try:
            client_id = self.messaging_provider.client_id
            client_secret = self.messaging_provider.client_secret
            
            if not client_id or not client_secret:
                return (False, "Missing client_id or client_secret")
            
            access_token = self._get_access_token()
            if access_token:
                return (True, True)
            else:
                return (False, "Failed to obtain access token from Swisscom")
                
        except Exception as e:
            return (False, str(e))
