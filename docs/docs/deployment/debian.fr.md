# Deploiement avec paquets Debian

Cette methode installe HCW@Home directement sur un serveur Debian/Ubuntu via des paquets `.deb`. Les services sont geres par systemd. C'est l'approche recommandee pour les deployements en production sur infrastructure dediee.

## Prerequis

- Debian 13 (Trixie) ou compatible
- PostgreSQL 15+
- Redis 7+
- Nginx
- 2 Go de RAM minimum

## Paquets disponibles

La solution est distribuee en trois paquets independants :

| Paquet | Contenu |
|--------|---------|
| `hcw-backend` | API Django, administration, worker Celery, scheduler |
| `hcw-practitioner` | Interface web praticien (Angular) |
| `hcw-patient` | Interface web/mobile patient (Ionic) |

## Installation

### 1. Installer les dependances systeme

```bash
apt install postgresql redis-server nginx
```

### 2. Creer la base de donnees

```bash
sudo -u postgres psql <<EOF
CREATE USER hcw WITH PASSWORD 'votre-mot-de-passe';
CREATE DATABASE hcw OWNER hcw;
EOF
```

### 3. Installer les paquets HCW

```bash
apt install hcw-backend hcw-practitioner hcw-patient
```

L'installation cree automatiquement :

- Un utilisateur systeme `hcw`
- Le repertoire `/var/lib/hcw/` pour les uploads
- Les services systemd

### 4. Configurer le backend

Editer le fichier de configuration :

```bash
nano /etc/hcw/backend.conf
```

Configuration minimale :

```ini
# Securite - OBLIGATOIRE : changez cette cle
DJANGOSECRET_KEY=votre-cle-secrete-aleatoire

# Domaines autorises
ALLOWED_HOST=votre-domaine.com
CSRF_TRUSTED_ORIGINS=https://votre-domaine.com

# Desactiver le mode debug
DEBUG=False

# Base de donnees
DATABASE_NAME=hcw
DATABASE_USER=hcw
DATABASE_PASSWORD=votre-mot-de-passe
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432

# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
DEFAULT_FROM_EMAIL=noreply@example.com

# Stockage
MEDIA_ROOT=/var/lib/hcw/uploads
STATIC_ROOT=/usr/share/hcw/backend/statics/

# Chiffrement
ENCRYPTION_KEY=votre-cle-sha256
```

!!! warning "Securite"
    Generez une cle de chiffrement avec : `echo -n "votre phrase secrete" | sha256sum`

Pour la liste complete des variables, consultez la page [Docker Compose](docker-compose.md#variables-denvironnement).

### 5. Creer un tenant

HCW@Home utilise le multi-tenancy avec isolation par schema PostgreSQL. Chaque tenant possede ses propres donnees, utilisateurs et configuration. Les tenants sont crees via le shell Django.

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py shell
```

```python
from django_tenants.utils import schema_context
from constance import config

# Choisir un nom de tenant (utilise comme nom de schema PostgreSQL)
tenant_name = 'montenant'

# Creer le tenant
tenant = Tenant(schema_name=tenant_name, name='Mon Organisation')
tenant.save()

# Enregistrer les domaines (portail praticien, portail patient, admin)
Domain.objects.create(domain=f'{tenant_name}.portal.example.com', tenant=tenant)
Domain.objects.create(domain=f'{tenant_name}.consult.example.com', tenant=tenant)
Domain.objects.create(domain=f'{tenant_name}.connect.example.com', tenant=tenant)

# Creer un super-utilisateur, un serveur media et un fournisseur de messagerie dans le tenant
with schema_context(tenant_name):
    User.objects.create_superuser('admin@example.com', 'votre-mot-de-passe')
    Server.objects.create(
        url="https://livekit.example.com",
        api_token="votre-cle-api",
        api_secret="votre-secret-api",
    )
    MessagingProvider.objects.create(name='email', from_email="noreply@example.com")

# Configurer les URLs des frontends pour le tenant
with schema_context(tenant_name):
    config.patient_base_url = f'https://{tenant_name}.consult.example.com'
    config.practitioner_base_url = f'https://{tenant_name}.connect.example.com'
```

!!! tip "Plusieurs tenants"
    Repetez ce processus pour chaque organisation. Chaque tenant est completement isole : utilisateurs, consultations, configuration et branding separes.

### 6. Collecter les fichiers statiques

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py collectstatic --noinput
```

### 7. Demarrer les services

```bash
systemctl enable --now hcw
systemctl enable --now hcw-celery
systemctl enable --now hcw-scheduler
```

## Services systemd

Trois services sont installes :

| Service | Commande | Description |
|---------|----------|-------------|
| `hcw` | `daphne -p 8000 core.asgi:application` | API Django (HTTP + WebSocket) |
| `hcw-celery` | `celery -A core.celery worker` | Worker pour taches asynchrones |
| `hcw-scheduler` | `celery -A core.celery beat` | Planificateur de taches periodiques |

Le service `hcw` execute automatiquement les migrations au demarrage (`ExecStartPre`).

### Gestion des services

```bash
# Demarrer / arreter / redemarrer
systemctl start hcw
systemctl stop hcw
systemctl restart hcw

# Voir les logs
journalctl -u hcw -f
journalctl -u hcw-celery -f
journalctl -u hcw-scheduler -f

# Statut
systemctl status hcw hcw-celery hcw-scheduler
```

## Configuration Nginx

Le paquet `hcw-backend` fournit un fichier de configuration Nginx de reference. Copiez-le et adaptez-le :

```bash
cp /usr/share/hcw/nginx /etc/nginx/sites-available/hcw
ln -s /etc/nginx/sites-available/hcw /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

La configuration par defaut definit deux blocs serveur :

### Interface praticien (domaine principal)

```nginx
server {
    listen 80 default_server;
    root /usr/share/hcw/practitioner;

    # Fichiers statiques backend (admin)
    location /static/ {
        alias /usr/share/hcw/backend/statics/;
        expires 1y;
    }

    # API et WebSocket
    location ~* ^/(api|ws) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Interface patient (sous-domaine)

```nginx
server {
    listen 80;
    root /usr/share/hcw/patient;
    server_name patient.example.com;

    # Meme configuration API/WS et SPA
    location ~* ^/(api|ws) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

!!! tip "HTTPS"
    En production, ajoutez un certificat TLS. Avec Let's Encrypt : `certbot --nginx -d votre-domaine.com -d patient.votre-domaine.com`

## Arborescence des fichiers

```
/usr/share/hcw/
├── backend/              # Code Django + virtualenv
│   ├── venv/             # Environnement Python
│   ├── manage.py
│   └── statics/          # Fichiers statiques collectes
├── practitioner/         # Build Angular (fichiers statiques)
└── patient/              # Build Ionic (fichiers statiques)

/etc/hcw/
└── backend.conf          # Configuration (variables d'environnement)

/var/lib/hcw/
└── uploads/              # Fichiers uploades par les utilisateurs
```

## Mise a jour

```bash
apt update
apt upgrade hcw-backend hcw-practitioner hcw-patient
systemctl restart hcw hcw-celery hcw-scheduler
```

Les migrations sont appliquees automatiquement au redemarrage du service `hcw`.

## Charger les donnees de test (optionnel)

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py loaddata initial/TestData.json
```
