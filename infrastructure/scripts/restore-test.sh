#!/usr/bin/env bash
# Proves a backup is restorable: restores a dump into a throwaway PostgreSQL container and
# prints row counts. Run monthly. Usage: infrastructure/scripts/restore-test.sh [dump-file]
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:-$(ls -1t backup/cmnews-*.dump | head -1)}"
NAME="cmnews-restore-test-$$"
echo "restoring ${DUMP}"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=cmnews -v "$(pwd)/$(dirname "$DUMP"):/backup:ro" postgres:17.11-alpine > /dev/null
trap 'docker stop "$NAME" > /dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -d cmnews > /dev/null 2>&1; do sleep 1; done
sleep 2
docker exec "$NAME" pg_restore -U postgres -d cmnews --no-owner --exit-on-error "/backup/$(basename "$DUMP")"
docker exec "$NAME" psql -U postgres -d cmnews -At -c \
  "SELECT 'articles=' || count(*) FROM articles UNION ALL SELECT 'accepted=' || count(*) FROM articles WHERE status='accepted' UNION ALL SELECT 'users=' || count(*) FROM users UNION ALL SELECT 'bookmarks=' || count(*) FROM bookmarks"
echo "restore OK"
