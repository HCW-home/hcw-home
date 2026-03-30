# Use Cases

HCW@Home covers the main teleconsultation scenarios in the medical and institutional domains.

## Spontaneous Consultation (chat + call)

A practitioner creates a consultation for a patient and communicates in real time.

**Typical flow:**

1. The practitioner creates a new consultation from their interface
2. The patient receives an invitation via SMS or email with an access link
3. The patient accesses the interface via their browser (no installation required)
4. Practitioner and patient exchange via chat (messages, files, images)
5. The practitioner initiates a video or audio call
6. The patient receives the call notification and joins the consultation
7. The practitioner closes the consultation when finished

**Features used:** real-time chat, audio/video calls, file sharing, push notifications, SMS/email invitations.

---

## Scheduled Appointment

A practitioner schedules a consultation at a specific date and time with one or more participants.

**Typical flow:**

1. The practitioner creates an appointment from the calendar (FullCalendar)
2. They select the type: online (video) or in-person
3. Invited participants receive an automatic reminder (configurable: 24h before, 10 min before, etc.)
4. At the appointment time, each participant joins the video room
5. The practitioner can record the session if needed

**Features used:** calendar, automatic reminders, multi-participant video, session recording (S3).

---

## Multi-participant Consultation

Multiple practitioners and/or guests participate in the same consultation.

**Typical flow:**

1. The practitioner creates an appointment and adds multiple participants (colleagues, specialists, interpreters)
2. Each participant receives an invitation
3. Everyone joins the same video conference room
4. Screen sharing is available for presenting documents

**Features used:** multi-participant consultations, screen sharing, group chat.

---

## Anonymous Patient Invitation

A patient without an account is invited for a one-time teleconsultation.

**Typical flow:**

1. The practitioner creates a consultation and generates an invitation link
2. The link is sent via SMS or email to the patient
3. The patient accesses the consultation via their browser, without creating an account
4. After the consultation, the temporary account is automatically deleted (configurable)

**Features used:** temporary users, link invitations, auto-cleanup.

---

## Queue Management (Groups)

Consultation requests are distributed among practitioners in the same department.

**Typical flow:**

1. The administrator creates groups (e.g., "General Medicine", "Cardiology", "Dermatology")
2. Practitioners are assigned to one or more groups
3. A consultation request arrives in a group
4. Practitioners in the group see the request and one of them takes charge
5. The consultation is assigned to the practitioner who accepted

**Features used:** groups/queues, automatic or manual assignment, configurable assignment methods.

---

## Tele-triage / Pre-consultation

A patient fills out a request form with custom fields before being connected.

**Typical flow:**

1. The administrator configures custom fields (reason, symptoms, urgency, etc.)
2. The patient or an operator submits a consultation request
3. The request is routed to the appropriate group based on the reason
4. The practitioner reviews the pre-filled information before taking charge

**Features used:** custom fields, consultation reasons, queues.

---

## Document and Prescription Sharing

The practitioner securely shares documents, reports, or prescriptions with the patient.

**Typical flow:**

1. During or after the consultation, the practitioner sends files via chat
2. Files are scanned by the antivirus (ClamAV) before being transmitted
3. The patient downloads the documents from their interface
4. A PDF consultation report can be generated

**Features used:** file sharing, ClamAV antivirus, PDF report generation.

---

## Multi-organization / Multi-tenant

Multiple organizations (hospitals, clinics) share the same instance with complete data isolation.

**Typical flow:**

1. The system administrator creates a tenant for each organization
2. Each organization has its own domain (e.g., `hospital-a.example.com`, `clinic-b.example.com`)
3. Users, consultations, and configurations are completely isolated between tenants
4. Each organization can customize its logo, colors, and settings

**Features used:** multi-tenancy by PostgreSQL schema, custom domains, independent configuration per tenant.

---

## Unified Authentication (SSO)

Users log in via the institution's existing authentication system.

**Typical flow:**

1. The administrator configures the OpenID Connect provider (Keycloak, Azure AD, etc.)
2. Practitioners log in via the "Sign in with..." button on the login page
3. Authentication is delegated to the identity provider
4. The account is automatically created on first login

**Features used:** OpenID Connect, JWT, automatic account creation.

---

## Administration and Monitoring

The administrator manages the platform via a dedicated interface.

**Use cases:**

- **User management**: create, edit, disable practitioner and patient accounts
- **Configuration**: set up reminders, timeouts, site name, application URLs
- **Message templates**: customize emails and SMS sent to patients
- **Translations**: override translations directly from the admin interface
- **Import/Export**: bulk import or export data (users, etc.)
- **Monitoring**: dashboard with usage statistics
- **API tokens**: generate tokens for integration with third-party systems

**Features used:** Unfold interface, constance (dynamic configuration), import/export, REST API with Swagger documentation.

---

## Role Summary

| Role | Interface | Access |
|------|-----------|--------|
| **Patient** | Patient app (Ionic/web) | Consultations, chat, calls, files |
| **Practitioner** | Practitioner app (Angular PWA) | Full consultation management, appointments, calendar |
| **Administrator** | Django admin (Unfold) | Configuration, users, templates, monitoring |
| **Super administrator** | Django admin | System configuration, API tokens, advanced settings |
