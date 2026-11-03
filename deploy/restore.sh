#!/usr/bin/env bash
# Vracanje iz backup-a.   bash deploy/restore.sh /mnt/backup/elgor/2026-11-03
# PREPISUJE trenutne podatke. Pita za potvrdu. Zaustavlja aplikaciju tokom vracanja.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:?Navedite fasciklu backup-a, npr. /mnt/backup/elgor/2026-11-03}"
[ -s "$SRC/postgres.dump" ] && [ -s "$SRC/servicehub.db" ] || { echo "U $SRC nema postgres.dump i servicehub.db"; exit 1; }
DATA_DIR="$(grep -E '^DATA_DIR=' .env | cut -d= -f2-)"; DATA_DIR="${DATA_DIR:-./data}"

echo "Ovo ZAMENJUJE trenutnu bazu i fotografije podacima iz: $SRC"
read -r -p "Ukucajte DA za nastavak: " ok
[ "$ok" = "DA" ] || { echo "Prekinuto."; exit 1; }

docker compose stop caddy java node
docker compose up -d postgres

echo "Cekam Postgres..."
for _ in $(seq 1 30); do docker compose exec -T postgres pg_isready -U elgor -d elgor_nalog >/dev/null 2>&1 && break; sleep 2; done

# --clean --if-exists: brise postojece objekte pa vraca; schema_history (Flyway) dolazi iz dump-a, pa se migracije ne ponavljaju
docker compose exec -T postgres pg_restore -U elgor -d elgor_nalog --clean --if-exists --no-owner < "$SRC/postgres.dump"

cp "$SRC/servicehub.db" "$DATA_DIR/node/servicehub.db"
rm -f "$DATA_DIR/node/servicehub.db-wal" "$DATA_DIR/node/servicehub.db-shm"
chown 1000:1000 "$DATA_DIR/node/servicehub.db" 2>/dev/null || sudo chown 1000:1000 "$DATA_DIR/node/servicehub.db"

rsync -a --delete "$SRC/photos/" "$DATA_DIR/photos/"
chown -R 10001:10001 "$DATA_DIR/photos" 2>/dev/null || sudo chown -R 10001:10001 "$DATA_DIR/photos"
if [ -d "$SRC/node-uploads" ]; then
  rsync -a --delete "$SRC/node-uploads/" "$DATA_DIR/node/uploads/"
  chown -R 1000:1000 "$DATA_DIR/node/uploads" 2>/dev/null || sudo chown -R 1000:1000 "$DATA_DIR/node/uploads"
fi

docker compose up -d
echo "Vraceno. Proverite: docker compose ps"
