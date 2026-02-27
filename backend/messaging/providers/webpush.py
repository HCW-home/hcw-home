import json
import logging
from typing import TYPE_CHECKING

from django.conf import settings
from pywebpush import WebPushException, webpush

from . import BaseMessagingProvider

if TYPE_CHECKING:
    from ..models import Message

logger = logging.getLogger(__name__)


class Main(BaseMessagingProvider):
    display_name = "Web Push (VAPID)"
    communication_method = "push"
    required_fields = []

    def send(self, message: "Message"):
        from users.models import WebPushSubscription

        if not message.sent_to:
            raise Exception("Web Push requires a sent_to user")

        subscriptions = WebPushSubscription.objects.filter(
            user=message.sent_to, is_active=True
        )

        if not subscriptions.exists():
            raise Exception(
                f"No active Web Push subscriptions for user {message.sent_to.pk}"
            )

        payload = json.dumps(
            {
                "title": message.render_subject or "HCW@Home",
                "body": message.render_content or "",
                "icon": "/assets/icons/icon-192x192.png",
                "badge": "/assets/icons/icon-72x72.png",
                "data": {
                    "access_link": message.access_link or "",
                    "message_id": message.pk,
                },
            }
        )

        vapid_private_key = settings.WEBPUSH_VAPID_PRIVATE_KEY
        vapid_claims = {"sub": settings.WEBPUSH_VAPID_CLAIMS_EMAIL}

        sent_count = 0
        errors = []

        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info=subscription.subscription_info,
                    data=payload,
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims,
                )
                sent_count += 1
            except WebPushException as e:
                logger.warning(
                    f"WebPush failed for subscription {subscription.pk}: {e}"
                )
                if e.response and e.response.status_code in (404, 410):
                    subscription.is_active = False
                    subscription.save(update_fields=["is_active"])
                errors.append(str(e))

        if sent_count == 0:
            raise Exception(
                f"All Web Push subscriptions failed: {'; '.join(errors)}"
            )

    def test_connection(self):
        if not settings.WEBPUSH_VAPID_PRIVATE_KEY:
            raise Exception("WEBPUSH_VAPID_PRIVATE_KEY setting is required")
        if not settings.WEBPUSH_VAPID_PUBLIC_KEY:
            raise Exception("WEBPUSH_VAPID_PUBLIC_KEY setting is required")
