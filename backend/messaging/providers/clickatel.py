from . import BaseMessagingProvider
from typing import TYPE_CHECKING, Tuple, Any
import requests

if TYPE_CHECKING:
    from ..models import Message, MessageStatus, MessagingProvider

class Main(BaseMessagingProvider):

    display_name = "Clickatel SMS"
    communication_method = "sms"
    required_fields = ['from_phone', 'api_key']
    
    def send(self, message: 'Message') -> 'MessageStatus':
        from ..models import MessageStatus
        
        try:
            if not message.recipient_phone:
                return MessageStatus.failed
            
            api_key = self.messaging_provider.api_key
            if not api_key:
                return MessageStatus.failed
            
            from_number = self.messaging_provider.from_phone
            if not from_number:
                return MessageStatus.failed
            
            url = "https://platform.clickatell.com/messages"
            
            headers = {
                'Authorization': f"Bearer {api_key}",
                'Content-Type': 'application/json'
            }

            # Append access link if action exists
            message_text = message.content
            if message.access_link:
                message_text = f"{message.content}\n{message.access_link}"

            data = {
                "messages": [{
                    "to": [message.recipient_phone],
                    "from": from_number,
                    "text": message_text
                }]
            }
            
            response = requests.post(url, json=data, headers=headers)
            
            if response.status_code in [200, 201, 202]:
                response_data = response.json()
                messages = response_data.get('messages', [])
                if messages and messages[0].get('accepted'):
                    return MessageStatus.sent
                else:
                    return MessageStatus.failed
            else:
                return MessageStatus.failed
                
        except Exception:
            return MessageStatus.failed
    
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