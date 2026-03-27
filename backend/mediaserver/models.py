from importlib import import_module
from typing import Union
import logging

from django.core.cache import cache
from django.db import connection, models
from django.utils.translation import gettext_lazy as _

from . import manager
from .manager import BaseMediaserver

logger = logging.getLogger(__name__)

# Create your models here.
class Server(models.Model):
    url = models.URLField(_("URL"))
    api_token = models.CharField(_("API token"), blank=True, null=True)
    api_secret = models.CharField(_("API secret"), blank=True, null=True)
    max_session_number = models.IntegerField(_("max session number"), default=10)
    type = models.CharField(choices=manager.MAIN_DISPLAY_NAMES)
    is_active = models.BooleanField(_("is active"), default=True)

    class Meta:
        verbose_name = _("server")
        verbose_name_plural = _("servers")

    def __str__(self):
        return self.url

    @property
    def module(self):
        return import_module(f"..manager.{self.type}", __name__)

    @property
    def instance(self) -> BaseMediaserver:
        return self.module.Main(self)

    @classmethod
    def get_server(cls) -> 'Server':
        """Get server with round robin"""


        cache_key = "round_robin_index"
        current_index = cache.get(cache_key, 0)

        active_servers = cls.objects.filter(is_active=True)
        active_server_count = active_servers.count()

        for i in range(active_server_count):
            try:
                next_index = (1 + i + current_index) % active_server_count
                obj = active_servers[next_index]
                obj.instance.test_connection()
                cache.set(cache_key, next_index)
                return obj
            except:
                logger.warning(f"The server is not reachable or has wrong credential: {obj}")
                continue


class Turn(models.Model):
    login = models.CharField(_("login"), null=True, blank=True)
    credential = models.CharField(_("credential"), null=True, blank=True)

    class Meta:
        verbose_name = _("TURN server")
        verbose_name_plural = _("TURN servers")


class TurnURL(models.Model):
    turn = models.ForeignKey(
        Turn, on_delete=models.CASCADE, verbose_name=_("TURN server")
    )
    url = models.CharField(_("URL"), help_text=_("TURN URL (e.g., turn://example.com)"))

    class Meta:
        verbose_name = _("TURN URL")
        verbose_name_plural = _("TURN URLs")
