#!/usr/bin/env bash
# Prva priprema servera (Ubuntu Server). Bezbedno za ponovno pokretanje: postojeci .env se NE prepisuje.
#   cd servicehub && bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker nije instaliran. Instalirajte Docker Engine (https://docs.docker.com/engine/install/ubuntu/) pa pokrenite ponovo."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Nedostaje 'docker compose' plugin (paket docker-compose-plugin)."; exit 1; }
command -v openssl >/dev/null || { echo "Nedostaje openssl (sudo apt install openssl)."; exit 1; }

if [ -f .env ]; then
  echo ".env vec postoji - ne diram ga."
else
  cp .env.example .env
  chmod 600 .env
  # tajne se generisu ovde i nigde se ne ispisuju
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  echo ".env napravljen sa novim tajnama. Otvorite ga i podesite SITE_ADDRESS, PUBLIC_URL, BACKUP_DIR."
fi

# Docker bi inace sam napravio ove fascikle kao root, pa servisi (koji ne rade kao root) ne bi mogli da pisu.
DATA_DIR="$(grep -E '^DATA_DIR=' .env | cut -d= -f2-)"; DATA_DIR="${DATA_DIR:-./data}"
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/photos" ./secrets
chown 10001:10001 "$DATA_DIR/photos"   2>/dev/null || sudo chown 10001:10001 "$DATA_DIR/photos"    # korisnik java servisa
# ./secrets: citljiv samo vlasniku i grupi java servisa (10001), da servis moze da procita Firebase kljuc
chgrp 10001 ./secrets 2>/dev/null || sudo chgrp 10001 ./secrets
chmod 750 ./secrets

echo
echo "Gotovo. Sledeci koraci:"
echo "  1) nano .env                         (adresa, cene, BACKUP_DIR)"
echo "  2) docker compose up -d --build      (prvi build traje nekoliko minuta)"
echo "  3) docker compose ps                 (sve treba da bude 'healthy' / 'running')"
echo "  4) bash deploy/backup.sh             (probni backup, pre nego sto iko pocne da koristi sistem)"
