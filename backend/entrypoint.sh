#!/bin/sh
set -e   # Stop on first error

# Apply migrations (dev reset if dev environment)
yarn prisma migrate deploy || yarn prisma migrate reset --force

yarn prisma generate

# Run admin script only if tables exist
node dist/scripts/admin.js || echo "Tables not ready yet"

exec "$@"
