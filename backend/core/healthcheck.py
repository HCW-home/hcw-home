"""
Health check middleware.
Responds to /api/health/ before tenant resolution so it works on any hostname.
"""
from django.http import JsonResponse


class HealthCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/api/health/":
            return JsonResponse({"status": "ok"})
        return self.get_response(request)
