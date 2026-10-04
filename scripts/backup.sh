#!/usr/bin/env bash
#
# Database backup to object storage.
#
# An untested backup is not a backup, so this script's counterpart is restore.sh and the
# procedure in README.md, which is meant to be rehearsed rather than read.
#
# Usage:  scripts/backup.sh [destination-directory]
#
# Reads from the environment (or .env): DATABASE_URL, and optionally
# BACKUP_DIR, BACKUP_RETENTION_DAYS, and the B2_* credentials to upload a copy off-box.

set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

: "${DATABASE_URL:?DATABASE_URL es obligatorio}"

DEST="${1:-${BACKUP_DIR:-./backups}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DEST/pethijos-$STAMP.dump"

mkdir -p "$DEST"

# The custom format (-Fc) rather than plain SQL: it restores with pg_restore, which can run in
# parallel and can restore a single table, and it is compressed.
#
# pg_dump runs inside the postgres container so the host needs no client installed and the
# version always matches the server -- a mismatch is the usual reason a restore fails at the
# moment it is needed.
echo "[backup] volcando a $FILE"
docker exec -i "${POSTGRES_CONTAINER:-pethijos-postgres}" \
  pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL" > "$FILE"

SIZE=$(wc -c < "$FILE" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] ERROR: el volcado pesa $SIZE bytes; algo falló" >&2
  rm -f "$FILE"
  exit 1
fi

# A dump that pg_restore cannot read is worse than no dump, because it is believed. Listing the
# table of contents is the cheapest check that the file is structurally sound.
echo "[backup] verificando la integridad del volcado"
# pg_restore reads the archive from stdin when given no file argument. Naming /dev/stdin
# explicitly fails instead ("did not find magic string in file header"): it is a pipe, and
# that path makes pg_restore try to seek it.
docker exec -i "${POSTGRES_CONTAINER:-pethijos-postgres}" pg_restore --list < "$FILE" > /dev/null
echo "[backup] ok: $SIZE bytes"

# Off-box copy. A backup on the same host as the database does not survive losing the host.
if [ -n "${B2_BUCKET_NAME:-}" ] && command -v aws > /dev/null 2>&1; then
  echo "[backup] subiendo a s3://$B2_BUCKET_NAME/backups/"
  AWS_ACCESS_KEY_ID="${B2_KEY_ID:-}" \
  AWS_SECRET_ACCESS_KEY="${B2_APPLICATION_KEY:-}" \
  aws s3 cp "$FILE" "s3://$B2_BUCKET_NAME/backups/$(basename "$FILE")" \
    --endpoint-url "https://${B2_ENDPOINT:-}"
else
  echo "[backup] aviso: sin copia remota (falta B2_BUCKET_NAME o el cliente aws)." >&2
  echo "[backup] una copia en el mismo host que la base no sobrevive a perder el host." >&2
fi

# Local rotation. The remote copy's lifecycle belongs to the bucket's own rules.
find "$DEST" -name 'pethijos-*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] listo"
