from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model

from . import AssignmentException, BaseAssignmentHandler

User = get_user_model()


class AssignmentHandler(BaseAssignmentHandler):
    """
    Handles APPOINTMENT assignment method.
    Creates consultation and appointment with mandatory doctor assignment.
    """

    display_name = "Appointment"

    def process(self):
        """
        Process the appointment request.

        Returns:
            AssignmentResult: Result containing consultation, appointment or error
        """

        # Find available doctor
        doctor = self._find_available_doctor()
        if not doctor:
            raise Exception("Unable to find doctor")

        # Create consultation
        self.request.consultation = self._create_consultation()

        # Create appointment with assigned doctor
        self.request.appointment = self._create_appointment(
            self.request.consultation, doctor
        )

        self.request.save(update_fields=["consultation", "appointment"])

        # Create participants (requester + doctor)
        self._create_participants(self.request.appointment, doctor)

    def _find_available_doctor(self):
        """
        Find an available doctor for the requested appointment.

        Returns:
            User: Available doctor or None if no doctor is available
        """

        from ..models import Appointment, AppointmentStatus

        # If specific doctor is requested
        if self.request.expected_with:
            if self._is_doctor_available(self.request.expected_with):
                return self.request.expected_with
            return None

        # Find doctors with the required specialty
        doctors = User.objects.filter(specialities=self.request.reason.speciality)

        if not doctors.exists():
            return None

        available_doctors = []
        for doctor in doctors:
            if self._is_doctor_available(doctor):
                # Convert requested datetime to doctor's timezone to get the correct date
                doctor_timezone = doctor.timezone or settings.TIME_ZONE
                doctor_tz = ZoneInfo(doctor_timezone)
                requested_datetime_in_doctor_tz = self.request.expected_at.astimezone(
                    doctor_tz
                )
                request_date = requested_datetime_in_doctor_tz.date()

                # Count appointments on the requested day
                appointment_count = Appointment.objects.filter(
                    consultation__owned_by=doctor,
                    scheduled_at__date=request_date,
                    status=AppointmentStatus.scheduled,
                ).count()

                available_doctors.append((doctor, appointment_count))

        if not available_doctors:
            return None

        # Return doctor with fewest appointments
        available_doctors.sort(key=lambda x: x[1])
        return available_doctors[0][0]

    def _is_doctor_available(self, doctor):
        """
        Check if a doctor is available at the requested time.

        Args:
            doctor: User instance of the doctor

        Returns:
            bool: True if doctor is available, False otherwise
        """
        from ..models import Appointment, AppointmentStatus, BookingSlot

        # Convert requested datetime to doctor's timezone for comparison
        # BookingSlot times are in the doctor's local timezone
        requested_datetime = self.request.expected_at
        doctor_timezone = doctor.timezone or settings.TIME_ZONE
        doctor_tz = ZoneInfo(doctor_timezone)

        # Convert to doctor's timezone for date/time extraction
        requested_datetime_in_doctor_tz = requested_datetime.astimezone(doctor_tz)
        requested_date = requested_datetime_in_doctor_tz.date()
        requested_time = requested_datetime_in_doctor_tz.time()

        # Get doctor's booking slots
        booking_slots = BookingSlot.objects.filter(user=doctor)

        # Check if any booking slot covers the requested time
        for slot in booking_slots:
            # Check if slot is valid for the requested date
            if slot.valid_until and slot.valid_until <= requested_date:
                continue

            # Check day of week
            weekday = requested_date.weekday()
            day_enabled = self._is_day_enabled(slot, weekday)

            if not day_enabled:
                continue

            # Check if time is within working hours
            if not (slot.start_time <= requested_time <= slot.end_time):
                continue

            # Check break times
            if (
                slot.start_break
                and slot.end_break
                and slot.start_break <= requested_time <= slot.end_break
            ):
                continue

            # Check for conflicts with existing appointments
            end_time = requested_datetime + timedelta(
                minutes=self.request.reason.duration
            )

            conflicts = Appointment.objects.filter(
                consultation__owned_by=doctor,
                scheduled_at__lt=end_time,
                end_expected_at__gt=requested_datetime,
                status=AppointmentStatus.scheduled,
            ).exists()

            if not conflicts:
                return True

        return False

    def _is_day_enabled(self, slot, weekday):
        """
        Check if a booking slot is enabled for the given weekday.

        Args:
            slot: BookingSlot instance
            weekday: Day of week (0=Monday, 6=Sunday)

        Returns:
            bool: True if day is enabled
        """
        day_mapping = {
            0: slot.monday,
            1: slot.tuesday,
            2: slot.wednesday,
            3: slot.thursday,
            4: slot.friday,
            5: slot.saturday,
            6: slot.sunday,
        }
        return day_mapping.get(weekday, False)

    def _create_appointment(self, consultation, doctor):
        """
        Create an appointment with the assigned doctor.

        Args:
            consultation: The consultation instance
            doctor: The assigned doctor user instance

        Returns:
            Appointment: The created appointment instance
        """
        from ..models import Appointment, AppointmentStatus

        end_time = self.request.expected_at + timedelta(
            minutes=self.request.reason.duration
        )

        appointment = Appointment.objects.create(
            consultation=consultation,
            scheduled_at=self.request.expected_at,
            end_expected_at=end_time,
            type=self.request.type,
            status=AppointmentStatus.scheduled,
            created_by=self.request.created_by,
        )

        # Update consultation to be owned by the assigned doctor
        consultation.owned_by = doctor
        consultation.save()

        return appointment
