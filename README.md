# Health Care Worker @Home

HCW@Home V6 is full rewrite of the previous project HCW@Home solution developped Iabsis SARL (Switzerland).

HCW@Home is a scalable, institution-level secure teleconsultation system for typical telemedicine scenarios, achieved through close collaboration with healthcare professionals. It is fully open-source and offers integrated features for chat, audio, and video calls using WebRTC.

### Features

#### Communication & Collaboration

- **Audio & Video Calls** - High-quality WebRTC video conferencing powered by LiveKit
- **Secure Real-time Chat** - End-to-end messaging with file sharing
- **Screen Sharing** - Share your screen during consultations
- **Multi-party Consultations** - Invite colleagues and guests to join consultations
- **Patient Invitations** - Invite patients in seconds via SMS or Email

#### Media & Files

- **Attachment Sharing** - Send and receive images, documents, and files
- **Antivirus Protection** - Integrated ClamAV scanning for uploaded files
- **Session Recording** - Automatic recording of consultations with S3 storage
- **PDF Reports** - Generate consultation reports in PDF format

#### Scheduling & Appointments

- **Appointment Calendar** - Full calendar interface with FullCalendar integration
- **Automated Reminders** - Configurable appointment reminders via push notifications
- **Booking Slots** - Manage availability and booking slots

#### Multi-platform Support

- **Progressive Web App (PWA)** - Installable web application for practitioners
- **Cross-platform** - Works seamlessly on desktop and mobile devices
- **Responsive Design** - All interfaces adapt seamlessly to any screen size

#### Authentication & Security

- **OpenID Connect** - External authentication support (SSO)
- **JWT Authentication** - Secure token-based authentication
- **Multi-factor Authentication** - Enhanced security for user accounts
- **Role-based Access Control** - Fine-grained permissions system
- **Data Encryption** - Encrypted storage for sensitive information

#### Customization & Configuration

- **Multi-language Support** - Available in English, French, and German
- **Custom Fields** - Define custom fields for consultations
- **Message Templates** - Pre-defined templates with validation
- **Organizations & Groups** - Multi-organization support with queue management
- **Specialties Management** - Configure medical specialties
- **Dynamic Configuration** - Real-time configuration updates without restart
- **Multi-language Support** - All interfaces fully translated in English, French, and German, more coming soon

#### Administration

- **Modern Admin Interface** - Clean, intuitive admin panel powered by Unfold
- **User Management** - Manage users, temporary users, and permissions
- **Translation Overrides** - Customize translations directly from admin
- **Analytics Dashboard** - Monitor system usage and statistics
- **Import/Export** - Bulk data import and export capabilities

#### API & Integration

- **RESTful API** - Complete API with OpenAPI/Swagger documentation
- **Webhooks** - Integration with external systems
- **S3 Storage** - Compatible with AWS S3 and S3-compatible storage

#### Performance & Scalability

- **Redis Caching** - Fast caching layer for improved performance
- **Celery Tasks** - Asynchronous task processing
- **WebSocket Support** - Real-time updates via Django Channels
- **Auto-cleanup** - Automatic deletion of old consultations and temporary users

### Links

- [Official Website](https://hcw-at-home.com/)

### Licensing

HCW@Home is provided under GPLv3.

### Contribute to translations

A web interface is available at [translate.iabsis.com](https://translate.iabsis.com/) to help with translations without needing to edit files directly.

For developers who prefer working with files directly or need to add new language:

1. Register the language in `backend/core/settings.py` in the `LANGUAGES` tuple. This is required for the language to appear in the `/api/config` endpoint used by the frontends:

```python
LANGUAGES = (
    ("en", gettext("English")),
    ("de", gettext("German")),
    ("fr", gettext("French")),
    ("it", gettext("Italian")),  # new language
)
```

2. Create a new JSON file in both `practitioner/public/i18n/` and `patient/src/assets/i18n/` (e.g., `it.json`), using `en.json` as a template. Put the empty `{}` inside.
3. Register the Angular locale in both `practitioner/src/main.ts` and `patient/src/main.ts`:

```typescript
import localeIt from '@angular/common/locales/it';
registerLocaleData(localeIt);
```

4. Create the backend locale directory and generate the `.po` file:

```bash
cd backend
python3 manage.py makemessages --locale=it --ignore='venv/*'
```

5. Translate all strings and compile with `python3 manage.py compilemessages --ignore='venv/*'`.


### Test data

A fixture file is provided to quickly populate the database with realistic test data:

```bash
cd backend
python3 manage.py loaddata initial/TestData.json
```

This creates:
- 1 organisation (Hôpital Universitaire de Genève)
- 4 practitioners (1 admin, 1 generalist, 1 cardiologist, 1 dermatologist)
- 5 patients (including 1 anonymous/temporary)
- 3 queues (Médecine générale, Cardiologie, Dermatologie)
- 8 consultations with various statuses (open, closed, with/without beneficiary)
- 9 appointments (future, past, cancelled, online and in-person)

All users share the same password: `Test1234`

| Role | Email |
|------|-------|
| Admin | admin@example.com |
| Practitioner | dr.martin@example.com |
| Practitioner | dr.bernard@example.com |
| Practitioner | dr.duval@example.com |
| Patient | jean.dupont@example.com |
| Patient | marie.leclerc@example.com |
| Patient | ahmed.benali@example.com |
| Patient | laura.rossi@example.com |

### Installation

This part will coming soon.