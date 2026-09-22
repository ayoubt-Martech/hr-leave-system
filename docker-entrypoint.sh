#!/bin/sh
# Runs pending migrations (safe to re-run — every file is idempotent) before
# starting the app, so the schema is always current on container start/restart.
set -e

echo "[entrypoint] Running database migrations..."
node dist-server/db/migrate.js

# No-op unless BOOTSTRAP_SUPERADMIN_EMAIL/NAME are set and no SuperAdmin
# exists yet — see server/db/bootstrapAdmin.ts for details.
echo "[entrypoint] Checking for SuperAdmin bootstrap..."
node dist-server/db/bootstrapAdmin.js

echo "[entrypoint] Starting application..."
exec "$@"
