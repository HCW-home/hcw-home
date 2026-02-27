from consultations.views import BookingSlotViewSet
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"languages", views.LanguageViewSet)
router.register(r"specialities", views.SpecialityViewSet)
router.register(r"terms", views.TermViewSet)
router.register(r"users", views.UserViewSet)

# Create a separate router for user-specific endpoints
user_router = DefaultRouter()
user_router.register(r"bookingslots", BookingSlotViewSet, basename="user-bookingslots")
user_router.register(
    r"appointments", views.UserAppointmentsViewSet, basename="user-appointments"
)
user_router.register(
    r"consultations", views.UserConsultationsViewSet, basename="user-consultations"
)

user_router.register(
    r"participants", views.UserParticipantViewSet, basename="user-participants"
)

urlpatterns = [
    path("api/", include(router.urls)),
    path("api/auth/openid/", views.OpenIDView.as_view(), name="openid_login"),
    path('api/auth/send-verification-code/', views.SendVerificationCodeView.as_view()),
    path("api/config/", views.AppConfigView.as_view(), name="app_config"),
    path(
        "api/user/notifications/",
        views.UserNotificationsView.as_view(),
        name="user_notifications",
    ),
    path(
        "api/user/notifications/read/",
        views.UserNotificationsMarkAllReadView.as_view(),
        name="user_notifications_mark_all_read",
    ),
    path(
        "api/user/notifications/<int:notification_id>/read/",
        views.UserNotificationReadView.as_view(),
        name="user_notification_read",
    ),
    path(
        "api/user/webpush/subscribe/",
        views.WebPushSubscribeView.as_view(),
        name="webpush_subscribe",
    ),
    path(
        "api/user/webpush/unsubscribe/",
        views.WebPushUnsubscribeView.as_view(),
        name="webpush_unsubscribe",
    ),
    path("api/user/testrtc/", views.TestRTCView.as_view(), name="user_testrtc"),
    path(
        "api/user/dashboard/",
        views.UserDashboardView.as_view(),
        name="user_dashboard",
    ),
    path(
        "api/messages/<int:message_id>/attachment/",
        views.MessageAttachmentView.as_view(),
        name="message_attachment",
    ),
    path("api/user/", include(user_router.urls)),
]
