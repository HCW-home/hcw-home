from . import BaseMessagingProvider
from typing import TYPE_CHECKING, Tuple, Any
import requests
import base64

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
    
    def send(self, message: 'Message') -> 'MessageStatus':
        from ..models import MessageStatus
        
        try:
            if not message.recipient_phone:
                return MessageStatus.failed
            
            access_token = self._get_access_token()
            if not access_token:
                return MessageStatus.failed
            
            sender = self.messaging_provider.sender_id
            if not sender:
                return MessageStatus.failed
            
            url = "https://api.swisscom.com/messaging/sms"
            
            headers = {
                'Authorization': f"Bearer {access_token}",
                'Content-Type': 'application/json'
            }

            # Append access link if action exists
            message_text = message.content
            if message.access_link:
                message_text = f"{message.content}\n{message.access_link}"

            data = {
                "from": sender,
                "to": message.recipient_phone,
                "text": message_text
            }
            
            response = requests.post(url, json=data, headers=headers)
            
            if response.status_code in [200, 201, 202]:
                return MessageStatus.sent
            else:
                return MessageStatus.failed
                
        except Exception:
            return MessageStatus.failed
    
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
