# Deployment with Debian Packages

This method installs HCW@Home directly on a Debian/Ubuntu server via `.deb` packages. Services are managed by systemd. This is the recommended approach for production deployments on dedicated infrastructure.

## Prerequisites

- Debian 13 (Trixie) or compatible
- PostgreSQL 15+
- Redis 7+
- Nginx
- Minimum 2 GB RAM

## Available Packages

The solution is distributed as three independent packages:

| Package | Content |
|---------|---------|
| `hcw-backend` | Django API, administration, Celery worker, scheduler |
| `hcw-practitioner` | Practitioner web interface (Angular) |
| `hcw-patient` | Patient web/mobile interface (Ionic) |

## Installation

### 1. Install system dependencies

```bash
apt install postgresql redis-server nginx
```

### 2. Create the database

```bash
sudo -u postgres psql <<EOF
CREATE USER hcw WITH PASSWORD 'your-password';
CREATE DATABASE hcw OWNER hcw;
EOF
```

### 3. Install HCW packages

```bash
apt install hcw-backend hcw-practitioner hcw-patient
```

The installation automatically creates:

- A `hcw` system user
- The `/var/lib/hcw/` directory for uploads
- The systemd services

### 4. Configure the backend

Edit the configuration file:

```bash
nano /etc/hcw/backend.conf
```

Minimal configuration:

```ini
# Security - REQUIRED: change this key
DJANGOSECRET_KEY=your-random-secret-key

# Allowed domains
ALLOWED_HOST=your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com

# Disable debug mode
DEBUG=False

# Database
DATABASE_NAME=hcw
DATABASE_USER=hcw
DATABASE_PASSWORD=your-password
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432

# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
DEFAULT_FROM_EMAIL=noreply@example.com

# Storage
MEDIA_ROOT=/var/lib/hcw/uploads
STATIC_ROOT=/usr/share/hcw/backend/statics/

# Encryption
ENCRYPTION_KEY=your-sha256-key
```

!!! warning "Security"
    Generate an encryption key with: `echo -n "your secret phrase" | sha256sum`

For the full list of variables, see the [Docker Compose](docker-compose.md#environment-variables) page.

### 5. Create a tenant

HCW@Home uses multi-tenancy with PostgreSQL schema isolation. Each tenant has its own data, users, and configuration. Tenants are created via the Django shell.

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py shell
```

```python
from tenants.models import Tenant, Domain
from users.models import User
from mediaserver.models import Server
from messaging.models import MessagingProvider
from django_tenants.utils import schema_context
from constance import config

# Choose a tenant name (used as PostgreSQL schema name)
tenant_name = 'mytenant'

# Create the tenant
tenant = Tenant(schema_name=tenant_name, name='My Organization')
tenant.save()

# Register the domains (practitioner portal, patient portal, admin)
Domain.objects.create(domain=f'{tenant_name}.portal.example.com', tenant=tenant)
Domain.objects.create(domain=f'{tenant_name}.consult.example.com', tenant=tenant)
Domain.objects.create(domain=f'{tenant_name}.connect.example.com', tenant=tenant)

# Create a superuser, media server, and messaging provider inside the tenant
with schema_context(tenant_name):
    User.objects.create_superuser('admin@example.com', 'your-password')
    Server.objects.create(
        url="https://livekit.example.com",
        api_token="your-api-key",
        api_secret="your-api-secret",
    )
    MessagingProvider.objects.create(name='email', from_email="noreply@example.com")

# Configure frontend URLs for the tenant
with schema_context(tenant_name):
    config.patient_base_url = f'https://{tenant_name}.consult.example.com'
    config.practitioner_base_url = f'https://{tenant_name}.connect.example.com'
```

!!! tip "Multiple tenants"
    Repeat this process for each organization. Each tenant is fully isolated: separate users, consultations, configuration, and branding.

### 6. Collect static files

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py collectstatic --noinput
```

### 7. Start the services

```bash
systemctl enable --now hcw
systemctl enable --now hcw-celery
systemctl enable --now hcw-scheduler
```

## Systemd Services

Three services are installed:

| Service | Command | Description |
|---------|---------|-------------|
| `hcw` | `daphne -p 8000 core.asgi:application` | Django API (HTTP + WebSocket) |
| `hcw-celery` | `celery -A core.celery worker` | Asynchronous task worker |
| `hcw-scheduler` | `celery -A core.celery beat` | Periodic task scheduler |

The `hcw` service automatically runs migrations on startup (`ExecStartPre`).

### Service Management

```bash
# Start / stop / restart
systemctl start hcw
systemctl stop hcw
systemctl restart hcw

# View logs
journalctl -u hcw -f
journalctl -u hcw-celery -f
journalctl -u hcw-scheduler -f

# Status
systemctl status hcw hcw-celery hcw-scheduler
```

## Nginx Configuration

The `hcw-backend` package provides a reference Nginx configuration file. Copy and adapt it:

```bash
cp /usr/share/hcw/nginx /etc/nginx/sites-available/hcw
ln -s /etc/nginx/sites-available/hcw /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

The default configuration defines two server blocks:

### Practitioner interface (main domain)

```nginx
server {
    listen 80 default_server;
    root /usr/share/hcw/practitioner;

    # Backend static files (admin)
    location /static/ {
        alias /usr/share/hcw/backend/statics/;
        expires 1y;
    }

    # API and WebSocket
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

### Patient interface (subdomain)

```nginx
server {
    listen 80;
    root /usr/share/hcw/patient;
    server_name patient.example.com;

    # Same API/WS and SPA configuration
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
    In production, add a TLS certificate. With Let's Encrypt: `certbot --nginx -d your-domain.com -d patient.your-domain.com`

## File Tree

```
/usr/share/hcw/
├── backend/              # Django code + virtualenv
│   ├── venv/             # Python environment
│   ├── manage.py
│   └── statics/          # Collected static files
├── practitioner/         # Angular build (static files)
└── patient/              # Ionic build (static files)

/etc/hcw/
└── backend.conf          # Configuration (environment variables)

/var/lib/hcw/
└── uploads/              # User-uploaded files
```

## Upgrading

```bash
apt update
apt upgrade hcw-backend hcw-practitioner hcw-patient
systemctl restart hcw hcw-celery hcw-scheduler
```

Migrations are automatically applied on `hcw` service restart.

## Load Test Data (optional)

```bash
cd /usr/share/hcw/backend
sudo -u hcw venv/bin/python manage.py loaddata initial/TestData.json
```
