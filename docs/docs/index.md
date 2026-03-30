# HCW@Home V6

HCW@Home is a scalable, institution-level secure teleconsultation system designed for typical telemedicine scenarios. Fully open-source (GPLv3), it provides integrated features for chat, audio, and video calls via WebRTC/LiveKit.

## Architecture

The solution is composed of several services:

| Service | Technology | Description |
|---------|------------|-------------|
| **API / Backend** | Django 5, Django REST Framework, Daphne (ASGI) | REST API, WebSocket, administration |
| **Celery Worker** | Celery | Asynchronous tasks (reminders, cleanup, notifications) |
| **Celery Beat** | Celery Beat | Periodic task scheduler |
| **Practitioner** | Angular 20 (PWA) | Web interface for practitioners |
| **Patient** | Ionic / Angular 20 | Web/mobile application for patients |
| **PostgreSQL** | PostgreSQL 15 | Database (multi-tenant by schema) |
| **Redis** | Redis 7 | Cache and message broker |
| **LiveKit** | LiveKit Server | Video/audio conferencing (WebRTC SFU) |
| **SMTP Server** | Any SMTP | Email delivery (invitations, reminders, notifications) |
| **SMS Gateway** *(optional)* | Twilio, etc. | SMS delivery for patient invitations |

## Key Features

- **Communication**: audio/video calls (LiveKit), real-time chat, screen sharing, multi-participant consultations
- **Scheduling**: calendar with FullCalendar, automated reminders, booking slots
- **Files**: file sharing, ClamAV antivirus, session recording (S3), PDF reports
- **Security**: JWT, OpenID Connect (SSO), MFA, data encryption, role-based access control
- **Multi-tenant**: isolation by PostgreSQL schema, independent configuration per tenant
- **Multi-language**: English, French, German (extensible)
- **Administration**: modern interface (Unfold), user management, import/export, dashboards

## Deployment

Two deployment methods are supported:

- [**Docker Compose**](deployment/docker-compose.md): containerized deployment, ideal for development and cloud environments
- [**Debian Packages**](deployment/debian.md): native deployment on Debian/Ubuntu with systemd

## Use Cases

See the [Use Cases](use-cases.md) page to discover the scenarios supported by the solution.

## Links

- [Official Website](https://hcw-at-home.com/)
- [Source Code](https://github.com/HCW-home/hcw-home)
- [Translations](https://translate.iabsis.com/)
