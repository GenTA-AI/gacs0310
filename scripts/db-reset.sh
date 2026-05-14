#!/usr/bin/env bash
# Wipe Postgres data and reapply db/init/* from scratch.
# Use this whenever you want a clean DB state for testing migrations.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Stopping containers..."
docker compose down

echo "Removing Postgres volume..."
docker volume rm gacs0310_postgres_data 2>/dev/null || true

echo "Bringing containers back up..."
docker compose up -d

echo "Waiting for Postgres to be ready..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-gacs}" >/dev/null 2>&1; then
        echo "Postgres ready."
        exit 0
    fi
    sleep 1
done

echo "Postgres did not become ready in 30s — check 'docker compose logs postgres'."
exit 1
