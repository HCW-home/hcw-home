from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType

from users.models import User, Organisation
from consultations.models import Consultation, Appointment, Participant
from messaging.models import Message, CommunicationMethod


class MessageICSAttachmentTestCase(TestCase):
    """Test ICS file generation for appointment messages"""

    def setUp(self):
        """Set up test data"""
        self.organisation = Organisation.objects.create(name="Test Org")

        self.user = User.objects.create_user(
            email="doctor@example.com",
            password="testpass123",
            first_name="Dr. John",
            last_name="Doe",
            communication_method=CommunicationMethod.email,
            main_organisation=self.organisation,
        )

        self.patient = User.objects.create_user(
            email="patient@example.com",
            password="testpass123",
            first_name="Jane",
            last_name="Smith",
            communication_method=CommunicationMethod.email,
            main_organisation=self.organisation,
        )

        self.consultation = Consultation.objects.create(
            title="Initial Consultation",
            description="First consultation for the patient",
            created_by=self.user,
            beneficiary=self.patient,
        )

        self.appointment = Appointment.objects.create(
            title="Follow-up Appointment",
            consultation=self.consultation,
            scheduled_at=timezone.now() + timedelta(days=1),
            end_expected_at=timezone.now() + timedelta(days=1, hours=1),
            created_by=self.user,
            type="online",
        )

        self.participant = Participant.objects.create(
            appointment=self.appointment,
            user=self.patient,
        )

    def test_ics_attachment_for_participant(self):
        """Test that ICS file is generated when content_object is a Participant"""
        content_type = ContentType.objects.get_for_model(Participant)

        message = Message.objects.create(
            subject="Your appointment reminder",
            content="You have an upcoming appointment",
            communication_method=CommunicationMethod.email,
            recipient_email=self.patient.email,
            sent_to=self.patient,
            sent_by=self.user,
            content_type=content_type,
            object_id=self.participant.pk,
        )

        ics_data = message.ics_attachment
        self.assertIsNotNone(ics_data)

        filename, content, mime_type = ics_data

        self.assertEqual(filename, f"appointment_{self.appointment.pk}.ics")
        self.assertEqual(mime_type, "text/calendar")

        self.assertIn("BEGIN:VCALENDAR", content)
        self.assertIn("BEGIN:VEVENT", content)
        self.assertIn("END:VEVENT", content)
        self.assertIn("END:VCALENDAR", content)
        self.assertIn(f"UID:appointment-{self.appointment.pk}@", content)
        self.assertIn("SUMMARY:Follow-up Appointment", content)
        self.assertIn("DTSTART:", content)
        self.assertIn("DTEND:", content)

    def test_ics_attachment_for_appointment(self):
        """Test that ICS file is generated when content_object is an Appointment"""
        content_type = ContentType.objects.get_for_model(Appointment)

        message = Message.objects.create(
            subject="Your appointment reminder",
            content="You have an upcoming appointment",
            communication_method=CommunicationMethod.email,
            recipient_email=self.patient.email,
            sent_to=self.patient,
            sent_by=self.user,
            content_type=content_type,
            object_id=self.appointment.pk,
        )

        ics_data = message.ics_attachment
        self.assertIsNotNone(ics_data)

        filename, content, mime_type = ics_data
        self.assertEqual(filename, f"appointment_{self.appointment.pk}.ics")

    def test_no_ics_attachment_for_non_appointment(self):
        """Test that ICS file is NOT generated for non-appointment messages"""
        content_type = ContentType.objects.get_for_model(Consultation)

        message = Message.objects.create(
            subject="Consultation update",
            content="Your consultation has been updated",
            communication_method=CommunicationMethod.email,
            recipient_email=self.patient.email,
            sent_to=self.patient,
            sent_by=self.user,
            content_type=content_type,
            object_id=self.consultation.pk,
        )

        ics_data = message.ics_attachment
        self.assertIsNone(ics_data)

    def test_ics_attachment_without_content_object(self):
        """Test that ICS file is NOT generated when there's no content_object"""
        message = Message.objects.create(
            subject="General message",
            content="This is a general message",
            communication_method=CommunicationMethod.email,
            recipient_email=self.patient.email,
            sent_to=self.patient,
            sent_by=self.user,
        )

        ics_data = message.ics_attachment
        self.assertIsNone(ics_data)
