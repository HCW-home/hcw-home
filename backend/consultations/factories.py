from datetime import datetime, time, timedelta

import factory
from django.contrib.auth import get_user_model
from django.utils import timezone
from factory.django import DjangoModelFactory
from users.models import Organisation, Speciality

from consultations.models import (
    Appointment,
    AppointmentStatus,
    BookingSlot,
    Consultation,
    Message,
    Participant,
    Queue,
    Reason,
    Request,
    RequestStatus,
    Type,
)

User = get_user_model()


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    is_active = True
    is_staff = False
    is_superuser = False


class DoctorFactory(UserFactory):
    """Factory for creating doctor users with specialities"""

    pass


class PatientFactory(UserFactory):
    """Factory for creating patient users"""

    pass


class SpecialityFactory(DjangoModelFactory):
    class Meta:
        model = Speciality

    name = factory.Sequence(lambda n: f"Specialty {n}")


class OrganisationFactory(DjangoModelFactory):
    class Meta:
        model = Organisation

    name = factory.Faker("company")
    street = factory.Faker("street_address")
    city = factory.Faker("city")
    postal_code = factory.Faker("postcode")
    country = factory.Faker("country")


class QueueFactory(DjangoModelFactory):
    class Meta:
        model = Queue

    name = factory.Sequence(lambda n: f"Queue {n}")


class ReasonFactory(DjangoModelFactory):
    class Meta:
        model = Reason

    speciality = factory.SubFactory(SpecialityFactory)
    name = factory.Sequence(lambda n: f"Reason {n}")
    duration = 30
    is_active = True


class UserReasonFactory(ReasonFactory):
    """Factory for USER assignment method reasons"""

    user_assignee = factory.SubFactory(DoctorFactory)
    queue_assignee = None


class QueueReasonFactory(ReasonFactory):
    """Factory for QUEUE assignment method reasons"""

    queue_assignee = factory.SubFactory(QueueFactory)
    user_assignee = None


class AppointmentReasonFactory(ReasonFactory):
    """Factory for APPOINTMENT assignment method reasons"""

    user_assignee = None
    queue_assignee = None


class ConsultationFactory(DjangoModelFactory):
    class Meta:
        model = Consultation

    title = factory.Faker("sentence", nb_words=4)
    description = factory.Faker("text", max_nb_chars=200)
    created_by = factory.SubFactory(UserFactory)
    owned_by = factory.SubFactory(DoctorFactory)
    beneficiary = factory.SubFactory(PatientFactory)


class MessageFactory(DjangoModelFactory):
    class Meta:
        model = Message

    consultation = factory.SubFactory(ConsultationFactory)
    created_by = factory.SubFactory(UserFactory)
    content = factory.Faker("text", max_nb_chars=200)


class RequestFactory(DjangoModelFactory):
    class Meta:
        model = Request

    created_by = factory.SubFactory(PatientFactory)
    beneficiary = factory.SelfAttribute("created_by")
    expected_at = factory.LazyFunction(
        lambda: timezone.now() + timedelta(days=1, hours=2)
    )
    type = Type.online
    reason = factory.SubFactory(ReasonFactory)
    comment = factory.Faker("text", max_nb_chars=100)
    status = RequestStatus.requested


class AppointmentFactory(DjangoModelFactory):
    class Meta:
        model = Appointment

    consultation = factory.SubFactory(ConsultationFactory)
    scheduled_at = factory.LazyFunction(
        lambda: timezone.now() + timedelta(days=1, hours=2)
    )
    end_expected_at = factory.LazyAttribute(
        lambda obj: obj.scheduled_at + timedelta(minutes=30)
    )
    type = Type.online
    status = AppointmentStatus.scheduled
    created_by = factory.SubFactory(UserFactory)


class ParticipantFactory(DjangoModelFactory):
    class Meta:
        model = Participant

    appointment = factory.SubFactory(AppointmentFactory)
    user = factory.SubFactory(UserFactory)
    is_invited = True
    is_confirmed = False


class BookingSlotFactory(DjangoModelFactory):
    class Meta:
        model = BookingSlot

    created_by = factory.SubFactory(DoctorFactory)
    user = factory.SelfAttribute("created_by")
    start_time = time(8, 0)
    end_time = time(18, 0)
    start_break = time(12, 0)
    end_break = time(14, 0)
    monday = True
    tuesday = True
    wednesday = True
    thursday = True
    friday = True
    saturday = False
    sunday = False


# Trait factories for specific scenarios
class WeekendBookingSlotFactory(BookingSlotFactory):
    """Booking slot available on weekends"""

    monday = False
    tuesday = False
    wednesday = False
    thursday = False
    friday = False
    saturday = True
    sunday = True


class FullWeekBookingSlotFactory(BookingSlotFactory):
    """Booking slot available all week"""

    monday = True
    tuesday = True
    wednesday = True
    thursday = True
    friday = True
    saturday = True
    sunday = True


class NoBreakBookingSlotFactory(BookingSlotFactory):
    """Booking slot with no break times"""

    start_break = None
    end_break = None
