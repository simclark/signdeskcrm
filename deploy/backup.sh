#!/usr/bin/env bash
# Backup MySQL (Compose or managed) + local media volume for SignDesk.
# Usage (from repo root):
#   ./deploy/backup.sh [/path/to/backup-dir]
#
# For DigitalOcean Managed MySQL: set MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD
# (and optional MYSQL_SSL_CA) in .env — the script dumps via the api container
# when the builtin mysql service is not running.
#
# Spaces objects are NOT included. Enable DO Spaces versioning / lifecycle, or
# use `s3cmd sync` / rclone against DO_SPACES_BUCKET separately (see
# docs/ops/BACKUP_RESTORE.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")

mkdir -p "$OUT"

if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx mysql; then
  echo "Backing up Compose MySQL to $OUT/mysql.sql.gz"
  "${COMPOSE[@]}" exec -T mysql \
    sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --databases "$MYSQL_DATABASE"' \
    | gzip > "$OUT/mysql.sql.gz"
else
  echo "Backing up managed/remote MySQL via api container to $OUT/mysql.sql.gz"
  "${COMPOSE[@]}" exec -T api \
    sh -c 'mysqldump -h"$MYSQL_HOST" -P"${MYSQL_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --databases "$MYSQL_DATABASE"' \
    | gzip > "$OUT/mysql.sql.gz"
fi

echo "Backing up media volume to $OUT/media.tar.gz"
MEDIA_VOL="$("${COMPOSE[@]}" volume ls -q | grep media_data | head -n1 || true)"
if [[ -z "$MEDIA_VOL" ]]; then
  MEDIA_VOL="$(docker volume ls -q | grep media_data | head -n1 || true)"
fi
if [[ -z "$MEDIA_VOL" ]]; then
  echo "WARNING: Could not find media_data volume (ok if all media is on Spaces)" >&2
  echo "spaces-only" > "$OUT/media-skipped.txt"
else
  docker run --rm -v "$MEDIA_VOL:/media:ro" -v "$OUT:/backup" alpine \
    tar czf /backup/media.tar.gz -C /media .
fi

cat > "$OUT/MANIFEST.txt" <<EOF
created_at=$STAMP
host=$(hostname 2>/dev/null || echo unknown)
note=See docs/ops/BACKUP_RESTORE.md for restore steps and Spaces.
EOF

echo "Done: $OUT"
ls -lh "$OUT"
