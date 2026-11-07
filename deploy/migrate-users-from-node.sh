#!/usr/bin/env bash
# JEDNOKRATNO, korak 1 od 2: prepise naloge korisnika (sa lozinkama, ne moraju se menjati) iz STAROG Node servera.
# Pokrenuti dok jos radi STARA verzija (ona sa 'node' servisom), PRE prelaska na novu:
#   bash deploy/migrate-users-from-node.sh          -> pravi ./users-export.sql (sadrzi hesh lozinki: ne deliti, obrisati posle uvoza)
# Korak 2, posle prelaska na novu verziju i prvog starta:   bash deploy/import-users.sh
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose ps --status running --services | grep -qx node \
  || { echo "Servis 'node' ne radi. Ovaj korak se radi na STAROJ verziji, dok jos radi (docker compose up -d)."; exit 1; }

umask 077
docker compose exec -T node node - < tools/export-users-sqlite.js > users-export.sql
echo "Gotovo: users-export.sql ($(grep -c '^INSERT' users-export.sql) korisnika). Sledeci korak: predjite na novu verziju (git pull / checkout), docker compose up -d --build, pa: bash deploy/import-users.sh"
