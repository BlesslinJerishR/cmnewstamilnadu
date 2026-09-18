#!/usr/bin/env bash
# PostgreSQL backup: compressed custom-format dump -> verified -> copied off-server -> pruned.
#
# Run on the VPS from the repository root, e.g. daily from cron (03:30 IST):
#   30 22 * * * cd /opt/cmnews && infrastructure/scripts/backup-postgres.sh >> /var/log/cmnews-backup.log 2>&1
#
# Off-site copy uses rclone (configure a remote once with `rclone config`, e.g. OVH Object
# Storage / any S3-compatible bucket) and BACKUP_REMOTE=remote:bucket/path.
# OpenSearch is NOT backed up: it is rebuilt from PostgreSQL (node dist/cli.js reindex).
set -euo pipefail

cd "$(dirname "$0")/.."            # infrastructure/
COMPOSE="docker compose -f docker-compose.yml"
LOCAL_DIR="backup"
LOCAL_KEEP=3                        # dumps kept on the VPS (disk is small)
REMOTE="${BACKUP_REMOTE:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="cmnews-${STAMP}.dump"

mkdir -p "$LOCAL_DIR"
echo "[$(date -u +%FT%TZ)] dumping to ${LOCAL_DIR}/${FILE}"
# Written inside the container to the bind-mounted /backup directory.
$COMPOSE exec -T postgres pg_dump -U cmnews -d cmnews --format=custom --compress=6 --file="/backup/${FILE}"
$COMPOSE exec -T postgres pg_restore --list "/backup/${FILE}" > /dev/null
echo "dump verified ($(du -h "${LOCAL_DIR}/${FILE}" | cut -f1))"

if [ -n "$REMOTE" ]; then
  rclone copy "${LOCAL_DIR}/${FILE}" "${REMOTE}/daily/" --no-traverse
  # Weekly (Sunday) and monthly (1st) copies for longer retention.
  [ "$(date -u +%u)" = "7" ] && rclone copy "${LOCAL_DIR}/${FILE}" "${REMOTE}/weekly/" --no-traverse
  [ "$(date -u +%d)" = "01" ] && rclone copy "${LOCAL_DIR}/${FILE}" "${REMOTE}/monthly/" --no-traverse
  rclone delete "${REMOTE}/daily/" --min-age 14d
  rclone delete "${REMOTE}/weekly/" --min-age 60d
  rclone delete "${REMOTE}/monthly/" --min-age 365d
  echo "uploaded to ${REMOTE}"
else
  echo "WARNING: BACKUP_REMOTE not set; the only copy is on this server" >&2
fi

ls -1t "${LOCAL_DIR}"/cmnews-*.dump | tail -n +$((LOCAL_KEEP + 1)) | xargs -r rm -f
echo "done"
