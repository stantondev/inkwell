#!/bin/sh
# Docker entrypoint for Inkwell API
# Runs database migrations before starting the server.

set -e

echo "==> Running database migrations..."
bin/inkwell eval "Inkwell.Release.migrate()"

echo "==> Starting Inkwell API..."
exec "$@"
