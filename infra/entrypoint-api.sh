#!/bin/sh
# Container entrypoint for the API/worker image.
# Runs DB migrations (with retry while Postgres warms up) before handing
# control to the actual process command (CMD or docker-compose `command:`).
set -e

if [ "${SKIP_MIGRATE:-false}" = "true" ]; then
  echo "[entrypoint] SKIP_MIGRATE=true, skipping migrations"
else
  attempt=0
  max_attempts="${MIGRATE_MAX_ATTEMPTS:-15}"
  sleep_seconds="${MIGRATE_RETRY_SLEEP:-3}"
  until npm run migrate --workspace=@vnetwork/database; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] migrate failed after $attempt attempts, giving up"
      exit 1
    fi
    echo "[entrypoint] migrate failed (attempt $attempt/$max_attempts), retrying in ${sleep_seconds}s..."
    sleep "$sleep_seconds"
  done
  echo "[entrypoint] migrations OK"
fi

exec "$@"
