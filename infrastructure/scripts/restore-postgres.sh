#!/usr/bin/env bash
# Disaster recovery: restores a dump into the production database, then rebuilds the search
# index from it. DESTRUCTIVE: replaces the current database contents.
# Usage: infrastructure/scripts/restore-postgres.sh backup/cmnews-<stamp>.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?path to a .dump file inside infrastructure/backup}"
COMPOSE="docker compose -f docker-compose.yml"
read -r -p "This replaces the production database with ${DUMP}. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }
$COMPOSE stop api worker
$COMPOSE exec -T postgres pg_restore -U cmnews -d cmnews --clean --if-exists --no-owner --exit-on-error "/backup/$(basename "$DUMP")"
$COMPOSE run --rm --no-deps worker node dist/cli.js reindex
$COMPOSE start api worker
echo "restore complete; search index rebuilt from PostgreSQL"
