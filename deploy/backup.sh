#!/usr/bin/env bash
# Backup MySQL + media volume for SignDesk production Compose.
# Usage (from repo root, with prod stack running):
#   ./deploy/backup.sh [/path/to/backup-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")

mkdir -p "$OUT"

echo "Backing up MySQL to $OUT/mysql.sql.gz"
"${COMPOSE[@]}" exec -T mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --databases "$MYSQL_DATABASE"' \
  | gzip > "$OUT/mysql.sql.gz"

echo "Backing up media volume to $OUT/media.tar.gz"
MEDIA_VOL="$("${COMPOSE[@]}" volume ls -q | grep media_data | head -n1 || true)"
if [[ -z "$MEDIA_VOL" ]]; then
  # Fall back to project-prefixed volume name
  MEDIA_VOL="$(docker volume ls -q | grep media_data | head -n1 || true)"
fi
if [[ -z "$MEDIA_VOL" ]]; then
  echo "Could not find media_data volume" >&2
  exit 1
fi
docker run --rm -v "$MEDIA_VOL:/media:ro" -v "$OUT:/backup" alpine \
  tar czf /backup/media.tar.gz -C /media .

echo "Done: $OUT"
ls -lh "$OUT"
