#!/usr/bin/env bash
# Vracanje iz backup-a.   bash deploy/restore.sh /mnt/backup/elgor/2026-11-03
# PREPISUJE trenutne podatke. Pita za potvrdu. Zaustavlja aplikaciju tokom vracanja.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:?Navedite fasciklu backup-a, npr. /mnt/backup/elgor/2026-11-03}"
[ -s "$SRC/postgres.dump" ] || { echo "U $SRC nema postgres.dump"; exit 1; }
DATA_DIR="$(grep -E '^DATA_DIR=' .env | cut -d= -f2-)"; DATA_DIR="${DATA_DIR:-./data}"

echo "Ovo ZAMENJUJE trenutnu bazu i fotografije podacima iz: $SRC"
read -r -p "Ukucajte DA za nastavak: " ok
[ "$ok" = "DA" ] || { echo "Prekinuto."; exit 1; }

# ako nesto pukne usred vracanja, servisi ostaju ugaseni (bolje nego da rade nad pola vracenim podacima)
trap 'echo; echo "Vracanje NIJE zavrseno, servisi su ugaseni. Ispravite gresku i pokrenite skriptu ponovo (bezbedno je ponavljati)."' ERR

docker compose stop caddy java
docker compose up -d postgres

echo "Cekam Postgres..."
for _ in $(seq 1 30); do docker compose exec -T postgres pg_isready -U elgor -d elgor_nalog >/dev/null 2>&1 && break; sleep 2; done

# --clean --if-exists: brise postojece objekte pa vraca; schema_history (Flyway) dolazi iz dump-a, pa se migracije ne ponavljaju
docker compose exec -T postgres pg_restore -U elgor -d elgor_nalog --clean --if-exists --no-owner < "$SRC/postgres.dump"

# Fotografije pripadaju korisniku java servisa (uid 10001), pa se kopira kao root; vlasnik se zatim postavlja eksplicitno.
# (rsync -a bi pokusao da kopira vlasnika/grupu i pucao za obicnog korisnika.)
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

$SUDO mkdir -p "$DATA_DIR/photos"
$SUDO rsync -rlt --delete "$SRC/photos/" "$DATA_DIR/photos/"
$SUDO chown -R 10001:10001 "$DATA_DIR/photos"

docker compose up -d
echo "Vraceno. Proverite: docker compose ps"
