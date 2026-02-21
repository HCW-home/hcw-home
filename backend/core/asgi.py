"""
ASGI config for core project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/asgi/
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

import django

django.setup()


from channels.routing import ProtocolTypeRouter, URLRouter
from consultations.routing import websocket_urlpatterns as consultation_patterns
from django.core.asgi import get_asgi_application
from users.routing import websocket_urlpatterns as user_patterns

from .channelsmiddleware import CorsMiddleware, JWTAuthMiddleware

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": CorsMiddleware(
            JWTAuthMiddleware(URLRouter(user_patterns + consultation_patterns))
        ),
    }
)
