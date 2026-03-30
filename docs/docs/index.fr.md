# HCW@Home V6

HCW@Home est un systeme de teleconsultation securise, scalable et de niveau institutionnel, concu pour les scenarios typiques de telemedecine. Entierement open-source (GPLv3), il offre des fonctionnalites integrees de chat, d'appels audio et video via WebRTC/LiveKit.

## Architecture

La solution est composee de plusieurs services :

| Service | Technologie | Description |
|---------|-------------|-------------|
| **API / Backend** | Django 5, Django REST Framework, Daphne (ASGI) | API REST, WebSocket, administration |
| **Celery Worker** | Celery | Taches asynchrones (rappels, nettoyage, notifications) |
| **Celery Beat** | Celery Beat | Planificateur de taches periodiques |
| **Practitioner** | Angular 20 (PWA) | Interface web pour les praticiens |
| **Patient** | Ionic / Angular 20 | Application web/mobile pour les patients |
| **PostgreSQL** | PostgreSQL 15 | Base de donnees (multi-tenant par schema) |
| **Redis** | Redis 7 | Cache et broker de messages |
| **LiveKit** | LiveKit Server | Videoconference audio/video (WebRTC SFU) |
| **Serveur SMTP** | Tout SMTP | Envoi d'emails (invitations, rappels, notifications) |
| **Passerelle SMS** *(optionnel)* | Twilio, etc. | Envoi de SMS pour les invitations patients |

## Fonctionnalites principales

- **Communication** : appels audio/video (LiveKit), chat temps reel, partage d'ecran, consultations multi-participants
- **Rendez-vous** : calendrier avec FullCalendar, rappels automatiques, creneaux de reservation
- **Fichiers** : partage de fichiers, antivirus ClamAV, enregistrement de sessions (S3), rapports PDF
- **Securite** : JWT, OpenID Connect (SSO), MFA, chiffrement des donnees, controle d'acces par roles
- **Multi-tenant** : isolation par schema PostgreSQL, configuration independante par tenant
- **Multilingue** : anglais, francais, allemand (extensible)
- **Administration** : interface moderne (Unfold), gestion des utilisateurs, import/export, tableaux de bord

## Deploiement

Deux methodes de deploiement sont supportees :

- [**Docker Compose**](deployment/docker-compose.md) : deploiement containerise, ideal pour le developpement et les environnements cloud
- [**Paquets Debian**](deployment/debian.md) : deploiement natif sur Debian/Ubuntu avec systemd

## Cas d'utilisation

Consultez la page [Cas d'utilisation](use-cases.md) pour decouvrir les scenarios couverts par la solution.

## Liens

- [Site officiel](https://hcw-at-home.com/)
- [Code source](https://github.com/HCW-home/hcw-home)
- [Traductions](https://translate.iabsis.com/)
