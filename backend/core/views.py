
from datetime import datetime, timedelta
from django.utils import timezone
from django.contrib.auth import authenticate, get_user_model, login
from django.shortcuts import redirect
from django.views import View
from constance import config
from consultations.models import Consultation, Appointment, Queue, Request
from users.models import Organisation
from django.db.models import Count, Q
from django.utils.translation import gettext_lazy as _

User = get_user_model()


class LoginSelectorView(View):
    """View that lists available identity providers for admin login."""

    def get(self, request):
        if request.user.is_authenticated and request.user.is_staff:
            return redirect("admin:index")

        return self._render(request)

    def post(self, request):
        if request.user.is_authenticated and request.user.is_staff:
            return redirect("admin:index")

        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, email=email, password=password)

        if user is not None and user.is_staff:
            login(request, user)
            return redirect("admin:index")

        return self._render(request, error=_("Invalid email or password."))

    def _render(self, request, error=None):
        from allauth.socialaccount.models import SocialApp
        from django.contrib import admin
        from django.template.response import TemplateResponse

        social_apps = SocialApp.objects.filter(
            provider="openid_connect"
        )

        context = admin.site.each_context(request)
        context.update({
            "social_apps": social_apps,
            "next": "/admin/",
            "site_title": _("HCW@Home Admin"),
            "title": _("Sign in"),
            "disable_password_login": config.disable_password_login,
        })
        if error:
            context["login_error"] = error

        return TemplateResponse(request, "login.html", context)

def dashboard_callback(request, context):
    now = timezone.now()
    last_month = now - timedelta(days=30)
    last_week = now - timedelta(days=7)
    
    # User metrics
    total_users = User.objects.count()
    active_users = User.objects.filter(last_login__gte=last_month).count()
    online_users = sum(1 for u in User.objects.only("pk") if u.is_online)
    new_users_this_week = User.objects.filter(date_joined__gte=last_week).count()
    
    # Consultation metrics
    consultations_last_month = Consultation.objects.filter(created_at__gte=last_month).count()
    consultations_this_week = Consultation.objects.filter(created_at__gte=last_week).count()
    
    # Appointment metrics
    appointments_last_month = Appointment.objects.filter(created_at__gte=last_month).count()
    appointments_this_week = Appointment.objects.filter(created_at__gte=last_week).count()
    
    # Organization metrics
    total_organisations = Organisation.objects.count()
    
    # Queue metrics
    total_queues = Queue.objects.count()
    
    # Request metrics
    total_requests = Request.objects.count()
    pending_requests = Request.objects.filter(status='Requested').count()
    
    # Calculate growth percentages
    def calculate_growth(current, previous):
        if previous == 0:
            return "+100%" if current > 0 else "0%"
        growth = ((current - previous) / previous) * 100
        return f"+{growth:.1f}%" if growth >= 0 else f"{growth:.1f}%"
    
    # Previous periods for comparison
    prev_week = last_week - timedelta(days=7)
    prev_month = last_month - timedelta(days=30)
    
    consultations_prev_week = Consultation.objects.filter(
        created_at__gte=prev_week, created_at__lt=last_week
    ).count()
    appointments_prev_week = Appointment.objects.filter(
        created_at__gte=prev_week, created_at__lt=last_week
    ).count()
    new_users_prev_week = User.objects.filter(
        date_joined__gte=prev_week, date_joined__lt=last_week
    ).count()
    
    # Main KPI cards
    context['kpi'] = [
        {
            'title': _('Active Users'),
            'metric': f"{active_users:,}",
            'footer': f"{active_users} of {total_users:,} users active in last 30 days",
            'link': '/admin/users/user/'
        },
        {
            'title': _('Online Now'),
            'metric': f"{online_users:,}",
            'footer': "Users currently online"
        },
        {
            'title': _('Consultations'),
            'metric': f"{consultations_last_month:,}",
            'footer': "Total consultations in last 30 days"
        },
        {
            'title': _('Appointments'),
            'metric': f"{appointments_last_month:,}",
            'footer': "Total appointments in last 30 days"
        },
        {
            'title': _('Organizations'),
            'metric': f"{total_organisations:,}",
            'footer': "Total organizations in system",
            'link': '/admin/users/organisation/'
        },
        {
            'title': _('Queues'),
            'metric': f"{total_queues:,}",
            'footer': "Total consultation queues",
            'link': '/admin/consultations/queue/'
        },
        {
            'title': _('Requests'),
            'metric': f"{total_requests:,}",
            'footer': f"Total requests ({pending_requests} pending)",
            'link': '/admin/consultations/request/'
        }
    ]
    
    # Weekly metrics for detailed view
    context['weekly_metrics'] = [
        {
            'title': _('New Users This Week'),
            'metric': new_users_this_week,
            'growth': calculate_growth(new_users_this_week, new_users_prev_week),
            'description': _('New user registrations')
        },
        {
            'title': _('Consultations This Week'),
            'metric': consultations_this_week,
            'growth': calculate_growth(consultations_this_week, consultations_prev_week),
            'description': _('Consultations started this week')
        },
        {
            'title': _('Appointments This Week'),
            'metric': appointments_this_week,
            'growth': calculate_growth(appointments_this_week, appointments_prev_week),
            'description': _('Appointments scheduled this week')
        }
    ]
    
    # System health metrics
    consultation_completion_rate = 0
    if consultations_last_month > 0:
        completed_consultations = Consultation.objects.filter(
            created_at__gte=last_month
        ).count()
        consultation_completion_rate = (completed_consultations / consultations_last_month) * 100
    
    context['system_health'] = {
        'completion_rate': f"{consultation_completion_rate:.1f}%",
        'active_rate': f"{(active_users/total_users*100):.1f}%" if total_users > 0 else "0%",
        'online_rate': f"{(online_users/total_users*100):.1f}%" if total_users > 0 else "0%"
    }
    
    # Recent activity summary
    context['recent_activity'] = {
        'total_users': total_users,
        'active_users': active_users,
        'online_users': online_users,
        'consultations_month': consultations_last_month,
        'appointments_month': appointments_last_month,
        'last_updated': now.strftime('%Y-%m-%d %H:%M')
    }
    
    return context