import logging

from django.core.cache import cache
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Reset all users online status on server startup - clears cache keys"

    def add_arguments(self, parser):
        parser.add_argument(
            "--quiet",
            action="store_true",
            help="Run quietly without detailed output",
        )

    def handle(self, *args, **options):
        quiet = options.get("quiet", False)

        if not quiet:
            self.stdout.write(self.style.WARNING("Resetting user online status..."))

        try:
            # Clear all online cache keys
            # Django cache doesn't support pattern deletion natively,
            # so we clear the entire cache (safe at server startup)
            cache.clear()

            if not quiet:
                self.stdout.write("Cache cleared")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error resetting online status: {e}"))
            return

        if not quiet:
            self.stdout.write(
                self.style.SUCCESS("User online status reset completed")
            )

        logger.info("User online status reset: cache cleared")
