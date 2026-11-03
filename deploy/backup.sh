#!/usr/bin/env bash
# Nocni backup: baza (Postgres), stari SQLite (nalozi/korisnici u Node-u) i fotografije.
#   bash deploy/backup.sh
# Rezultat: $BACKUP_DIR/YYYY-MM-DD/{postgres.dump, servicehub.db, photos/}
# Fotografije se cuvaju kao "hard-link" snimci: svaki dan izgleda kao pun backup, a zauzima samo ono sto je novo.
set -euo pipefail
cd "$(dirname "$0")/.."

env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"
BACKUP_REMOTE="${BACKUP_REMOTE:-$(env_get BACKUP_REMOTE)}"
DATA_DIR="$(env_get DATA_DIR)"; DATA_DIR="${DATA_DIR:-./data}"
KEEP_DAYS="${KEEP_DAYS:-30}"
[ -n "$BACKUP_DIR" ] || { echo "BACKUP_DIR nije podesen u .env"; exit 1; }

# Ako je BACKUP_DIR na posebnom disku, a disk nije montiran, backup bi tiho otisao na isti disk kao podaci.
if [ -n "${REQUIRE_MOUNT:-$(env_get REQUIRE_MOUNT)}" ]; then
  mountpoint -q "${REQUIRE_MOUNT:-$(env_get REQUIRE_MOUNT)}" || { echo "Disk za backup nije montiran - prekidam."; exit 1; }
fi

DAY="$(date +%F)"
DEST="$BACKUP_DIR/$DAY"
TMP="$BACKUP_DIR/.tmp-$DAY"
rm -rf "$TMP"; mkdir -p "$TMP"

echo "[1/3] Postgres"
docker compose exec -T postgres pg_dump -U elgor -Fc elgor_nalog > "$TMP/postgres.dump"
[ -s "$TMP/postgres.dump" ] || { echo "Prazan dump - prekidam."; exit 1; }

echo "[2/3] SQLite (online backup, bezbedno dok server radi)"
docker compose exec -T node node -e "
  const Database = require('better-sqlite3');
  const db = new Database(process.env.DB_PATH, { fileMustExist: true });
  db.backup('/data/backup-tmp.db').then(() => { console.log('ok'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
"
cp "$DATA_DIR/node/backup-tmp.db" "$TMP/servicehub.db"
rm -f "$DATA_DIR/node/backup-tmp.db"

echo "[3/3] Fotografije"
PREV="$(ls -1d "$BACKUP_DIR"/20??-??-?? 2>/dev/null | grep -v "/$DAY\$" | tail -1 || true)"
LINK=()
[ -n "$PREV" ] && [ -d "$PREV/photos" ] && LINK=(--link-dest="$PREV/photos")
rsync -rlt "${LINK[@]}" "$DATA_DIR/photos/" "$TMP/photos/"
# fotografije koje su stare Node-ove (uploads) idu u isti snimak
if [ -d "$DATA_DIR/node/uploads" ]; then
  LINK2=()
  [ -n "$PREV" ] && [ -d "$PREV/node-uploads" ] && LINK2=(--link-dest="$PREV/node-uploads")
  rsync -rlt "${LINK2[@]}" "$DATA_DIR/node/uploads/" "$TMP/node-uploads/"
fi

# tek kad je sve uspelo, snimak dobija pravo ime (polovican backup se nikad ne vidi kao backup)
rm -rf "$DEST"; mv "$TMP" "$DEST"

find "$BACKUP_DIR" -maxdepth 1 -type d -name '20??-??-??' -mtime +"$KEEP_DAYS" -exec rm -rf {} +

if [ -n "$BACKUP_REMOTE" ]; then
  echo "Kopiranje na $BACKUP_REMOTE"
  rsync -aH --delete "$BACKUP_DIR/" "$BACKUP_REMOTE/"
fi

echo "Backup gotov: $DEST ($(du -sh "$DEST" | cut -f1))"
