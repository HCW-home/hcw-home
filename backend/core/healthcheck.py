"""
Health check middleware.
Responds to /api/health/ before tenant resolution so it works on any hostname.
Checks database and Redis connectivity.
"""
import redis
from django.conf import settings
from django.db import connections
from django.http import JsonResponse


class HealthCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/api/health/":
            checks = {}
            healthy = True

            # Check database
            try:
                db_conn = connections["default"]
                db_conn.ensure_connection()
                checks["database"] = "ok"
            except Exception as e:
                checks["database"] = str(e)
                healthy = False

            # Check Redis
            try:
                r = redis.Redis(
                    host=settings.REDIS_HOST,
                    port=int(settings.REDIS_PORT),
                    socket_connect_timeout=3,
                )
                r.ping()
                checks["redis"] = "ok"
            except Exception as e:
                checks["redis"] = str(e)
                healthy = False

            status_code = 200 if healthy else 503
            return JsonResponse(
                {"status": "ok" if healthy else "error", "checks": checks},
                status=status_code,
            )
        return self.get_response(request)
