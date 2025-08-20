#!/bin/sh
set -e   # Stop on first error
yarn prisma migrate deploy || yarn prisma migrate reset --force
yarn prisma generate
node dist/scripts/admin.js || echo "Tables not ready yet"
yarn prisma studio --port 5555 &
exec "$@"
