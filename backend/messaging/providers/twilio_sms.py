from . import BaseMessagingProvider
from typing import TYPE_CHECKING, Tuple, Any
import requests
import base64
import logging

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..models import Message, MessageStatus, MessagingProvider

class Main(BaseMessagingProvider):

    display_name = "Twilio SMS"
    communication_method = "sms"
    required_fields = ['account_sid', 'auth_token', 'from_phone']
    
    def _get_auth_header(self):
        account_sid = self.messaging_provider.account_sid
        auth_token = self.messaging_provider.auth_token
        if not account_sid or not auth_token:
            return None
        credentials = f"{account_sid}:{auth_token}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"
    
    def send(self, message: 'Message'):
        logger.info(f"Sending SMS via Twilio to {message.phone_number}")

        if not message.phone_number:
            error_msg = "Missing recipient phone number"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        auth_header = self._get_auth_header()
        if not auth_header:
            error_msg = "Missing Twilio credentials (account_sid or auth_token)"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        account_sid = self.messaging_provider.account_sid
        from_phone = self.messaging_provider.from_phone
        if not from_phone:
            error_msg = "Missing from_phone configuration"
            logger.error(error_msg)
            message.task_logs += f"{error_msg}\n"
            message.save()
            raise Exception(error_msg)

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        data = {
            'From': from_phone,
            'To': message.phone_number,
            'Body': message.render_content_sms
        }

        headers = {
            'Authorization': auth_header,
            'Content-Type': 'application/x-www-form-urlencoded'
        }

        logger.info(f"Sending POST request to Twilio SMS API: {url}")
        response = requests.post(url, data=data, headers=headers)
        logger.info(f"Twilio response status: {response.status_code}")

        message.task_logs += f"Twilio API response: {response.status_code}\n"
        message.task_logs += f"Response body: {response.text}\n"
        message.save()

        if response.status_code == 201:
            logger.info("SMS sent successfully via Twilio")
            return
        else:
            error_msg = f"Twilio API error: {response.status_code} - {response.text}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def test_connection(self) -> Tuple[bool, Any]:
        try:
            auth_header = self._get_auth_header()
            if not auth_header:
                return (False, "Missing account_sid or auth_token")
            
            account_sid = self.messaging_provider.account_sid
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json"
            
            headers = {'Authorization': auth_header}
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                return (True, True)
            else:
                return (False, f"Twilio API error: {response.status_code}")
                
        except Exception as e:
            return (False, str(e))
