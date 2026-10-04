#!/usr/bin/env bash
#
# Restores a backup into a DIFFERENT database, which is how a restore should be rehearsed:
# never into the live one, and with something to compare against afterwards.
#
# Usage:  scripts/restore.sh <file.dump> [target-database-name]
#
# The default target is pethijos_restore_check, so running this against a production host
# verifies the backup without touching the data it is insuring.

set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

FILE="${1:?Uso: scripts/restore.sh <file.dump> [base-de-datos-destino]}"
TARGET="${2:-pethijos_restore_check}"
CONTAINER="${POSTGRES_CONTAINER:-pethijos-postgres}"
USER="${POSTGRES_USER:?POSTGRES_USER es obligatorio}"

[ -f "$FILE" ] || { echo "No existe $FILE" >&2; exit 1; }

if [ "$TARGET" = "${POSTGRES_DB:-pethijos}" ]; then
  echo "ERROR: rehúso restaurar sobre la base en uso ($TARGET)." >&2
  echo "Indica otro nombre, o renombra la base en uso primero si de verdad es una recuperación." >&2
  exit 1
fi

echo "[restore] recreando $TARGET"
docker exec -i "$CONTAINER" psql -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET\";"
docker exec -i "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE \"$TARGET\";"

echo "[restore] restaurando $FILE"
# No file argument: pg_restore takes the archive on stdin. --exit-on-error so a partial
# restore fails loudly instead of leaving a database that looks fine until the missing table
# is needed.
docker exec -i "$CONTAINER" pg_restore \
  --username "$USER" --dbname "$TARGET" --no-owner --no-privileges --exit-on-error < "$FILE"

echo "[restore] comprobando el contenido"
docker exec -i "$CONTAINER" psql -U "$USER" -d "$TARGET" -c "
  SELECT
    (SELECT count(*) FROM daycares)              AS guarderias,
    (SELECT count(*) FROM users)                 AS usuarios,
    (SELECT count(*) FROM clients)               AS tutores,
    (SELECT count(*) FROM pets)                  AS perrhijos,
    (SELECT count(*) FROM reservations)          AS reservas,
    (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migraciones;
"

# The tenancy invariant is the one worth re-checking on a restored copy: if it does not hold,
# the backup is not a usable starting point whatever the row counts say.
echo "[restore] comprobando la invariante de inquilinos"
BAD=$(docker exec -i "$CONTAINER" psql -U "$USER" -d "$TARGET" -tAc "
  SELECT count(*) FROM users WHERE (role = 'superadmin') <> (\"daycareId\" IS NULL);
")
if [ "$BAD" != "0" ]; then
  echo "[restore] ERROR: $BAD usuario(s) violan users_superadmin_untenanted" >&2
  exit 1
fi

echo "[restore] ok. Base restaurada como $TARGET; elimínala cuando termines:"
echo "  docker exec -i $CONTAINER psql -U $USER -d postgres -c 'DROP DATABASE \"$TARGET\";'"
