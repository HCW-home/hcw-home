from tenant_schemas_celery.app import CeleryApp as TenantAwareCeleryApp
import os
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')


# Create default Celery app
app = TenantAwareCeleryApp()

# namespace='CELERY' means all celery-related configuration keys
# should be uppercased and have a `CELERY_` prefix in Django settings.
# https://docs.celeryproject.org/en/stable/userguide/configuration.html
app.config_from_object("django.conf:settings", namespace="CELERY")

# When we use the following in Django, it loads all the <appname>.tasks
# files and registers any tasks it finds in them. We can import the
# tasks files some other way if we prefer.
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)
