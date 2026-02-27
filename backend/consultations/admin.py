from django.contrib import admin
from modeltranslation.admin import TabbedTranslationAdmin
from unfold.admin import ModelAdmin, StackedInline, TabularInline
from unfold.decorators import display

from .models import (
    Appointment,
    BookingSlot,
    Consultation,
    CustomField,
    Message,
    Participant,
    Queue,
    Reason,
    Request,
)

admin.site.register(Participant, ModelAdmin)


@admin.register(CustomField)
class CustomFieldAdmin(ModelAdmin, TabbedTranslationAdmin):
    list_display = ["name", "field_type", "target_model", "required", "ordering"]
    list_filter = ["target_model", "field_type", "required"]
    search_fields = ["name"]


@admin.register(Queue)
class QueueAdmin(ModelAdmin, TabbedTranslationAdmin):
    list_display = ["name", "users_count", "organisations_count"]
    search_fields = ["name"]
    filter_horizontal = ["users", "organisation"]

    @display(description="Users")
    def users_count(self, obj):
        return obj.users.count()

    @display(description="Organisations")
    def organisations_count(self, obj):
        return obj.organisation.count()


class MessageInline(TabularInline):
    model = Message
    extra = 0
    readonly_fields = ["created_at"]
    fields = ["created_by", "content", "attachment"]


class AppointmentInline(StackedInline):
    model = Appointment
    extra = 0
    fields = ["created_by", "scheduled_at", "end_expected_at", "status"]
    readonly_fields = ["status"]
    show_change_link = True


class ParticipantInline(TabularInline):
    model = Participant
    extra = 0
    fields = [
        "user",
        "is_invited",
    ]


@admin.register(Consultation)
class ConsultationAdmin(ModelAdmin):
    list_display = [
        "id",
        "created_by",
        "beneficiary",
        "group",
        "visible_by_patient",
        "created_at",
        "closed_at",
        "messages_count",
    ]
    list_filter = ["created_at", "closed_at", "group", "visible_by_patient"]
    search_fields = ["created_by__email", "beneficiary__email", "group__name"]
    readonly_fields = ["created_at", "updated_at"]

    autocomplete_fields = [
        "beneficiary",
        "group",
        "owned_by",
    ]

    inlines = [AppointmentInline, MessageInline]

    @display(description="Messages")
    def messages_count(self, obj):
        return obj.messages.count()


@admin.register(Appointment)
class AppointmentAdmin(ModelAdmin):
    list_display = [
        "id",
        "consultation",
        "scheduled_at",
        "end_expected_at",
        "participants_count",
    ]
    list_filter = ["scheduled_at", "consultation__group"]
    search_fields = ["consultation__created_by__email"]

    inlines = [ParticipantInline]

    @display(description="Participants")
    def participants_count(self, obj):
        return obj.participants.count()


@admin.register(Reason)
class ReasonAdmin(ModelAdmin, TabbedTranslationAdmin):
    list_display = [
        "id",
        "name",
        "speciality",
        "duration",
        "is_active",
        "queue_assignee",
        "user_assignee",
    ]
    list_filter = ["is_active", "speciality", "queue_assignee"]
    search_fields = ["name", "speciality__name"]
    readonly_fields = ["created_at"]


@admin.register(Message)
class MessageAdmin(ModelAdmin):
    list_display = [
        "id",
        "consultation",
        "created_by",
        "content",
        "attachment",
        "created_at",
    ]


@admin.register(Request)
class RequestAdmin(ModelAdmin):
    list_display = [
        "id",
        "expected_at",
        "consultation",
        "created_by",
        "expected_with",
        "comment",
    ]


@admin.register(BookingSlot)
class BookingSlotAdmin(ModelAdmin):
    list_display = [
        "id",
        "user",
        "start_time",
        "end_time",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "valid_until",
    ]
