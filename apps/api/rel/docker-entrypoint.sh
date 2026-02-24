#!/bin/sh
# Docker entrypoint for Inkwell API
# Waits for database, runs migrations, then starts the server.

# Wait for database to be reachable before attempting migrations.
# Fly Postgres uses auto-suspend and can take 30-60s to wake up.
echo "==> Waiting for database..."
MAX_RETRIES=15
RETRY_DELAY=5
RETRIES=0

while [ $RETRIES -lt $MAX_RETRIES ]; do
  if bin/inkwell eval "Inkwell.Release.check_db()" 2>/dev/null; then
    echo "==> Database is ready."
    break
  fi
  RETRIES=$((RETRIES + 1))
  echo "==> Database not ready (attempt $RETRIES/$MAX_RETRIES), retrying in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
  echo "==> WARNING: Database not reachable after $MAX_RETRIES attempts."
  echo "==> Starting app WITHOUT migrations (will retry on next deploy)."
else
  echo "==> Running database migrations..."
  bin/inkwell eval "Inkwell.Release.migrate()" || echo "==> WARNING: Migrations failed, starting app anyway."
fi

echo "==> Starting Inkwell API..."
exec "$@"
