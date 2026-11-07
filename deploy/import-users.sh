#!/usr/bin/env bash
# JEDNOKRATNO, korak 2 od 2: uvozi ./users-export.sql (napravljen sa deploy/migrate-users-from-node.sh) u Postgres.
# Pokrenuti POSLE prvog starta nove verzije (Java tada pravi tabele i jednog privremenog admina; uvoz ga zamenjuje).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -s users-export.sql ] || { echo "Nema users-export.sql (prvo: bash deploy/migrate-users-from-node.sh na staroj verziji)."; exit 1; }
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U elgor -d elgor_nalog < users-export.sql
echo "Uvezeno. Prijavite se starim emailom i lozinkom. Obrisite users-export.sql:  shred -u users-export.sql  (ili rm)"
