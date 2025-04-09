This task focuses on enhancing the HCW-home platform by implementing two critical features:

Consultation Reminders: A scheduling system that sends automated reminders to patients and practitioners before a consultation, reducing missed appointments and improving engagement.

Consultation History View: A frontend interface that allows practitioners to view their past consultations, including key details such as patient name, date/time, and session summary.

Goals

Implement a backend scheduling system that sends automated consultation reminders via SMS or WhatsApp to patients and practitioners.

Allow configuration of reminder timing (e.g., 24 hours and/or 1 hour before the consultation).

Create a consultation history view in the practitioner dashboard displaying past sessions with key metadata (e.g., patient name, date/time, consultation ID).

Add search and filter functionality to the history view (e.g., by date, patient name).

Ensure the reminder system handles retries and failures gracefully with logging.

Make the history view mobile-responsive using Angular Material and ensure accessibility.
Expected Outcome
Patients and practitioners receive timely automated reminders before each scheduled consultation via SMS or WhatsApp.
Reminders are sent reliably based on predefined timing (e.g., 24 hours and/or 1 hour before), and failures are logged with retry support.
Practitioners can view a complete history of their past consultations in a dedicated dashboard section.
The consultation history view displays key details such as patient name, consultation time, and session ID.
Practitioners can search and filter past consultations by patient name or date.
The history view is fully responsive, accessible, and performs well on both desktop and mobile devices.
Backend and frontend components work seamlessly together to deliver a smooth user experience.
Acceptance Criteria
No response

Implementation Details
Consultation Reminder Scheduler:
Use a background job processor (e.g., Bull with Redis) in the NestJS backend to schedule reminder jobs when a consultation is created. Jobs should support sending reminders at configurable intervals (e.g., 24h and/or 1h before). Messages can be sent via existing SMS or WhatsApp provider integrations.

Reminder Timing Configuration:
Define default reminder intervals in environment variables. Ensure the system avoids sending duplicate reminders for rescheduled consultations.

Reminder Message Content:
Standardize message templates with dynamic placeholders (consultation time, patient/practitioner name, etc.). Ensure localization support for multilingual environments.

Consultation History View (Frontend):
Add a new route in the Angular practitioner dashboard to show a table/list of past consultations. Display key details: patient name, consultation date/time, and consultation ID.

API Support:
Backend endpoint to fetch consultation history with support for pagination, filtering by date range, and optional search by patient name.