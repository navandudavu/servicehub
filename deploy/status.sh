#!/usr/bin/env bash
# Jedan ekran: da li sve radi.
#   bash deploy/status.sh            jednom, pa izlazi (kod izlaza: 0 sve OK, 1 ima upozorenja, 2 ima greske)
#   bash deploy/status.sh --watch    osvezava se na 10 sekundi (Ctrl+C za kraj)
# Samo cita; nista ne menja.
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--watch" ]; then
  while true; do clear; bash "$0" || true; echo; echo "(osvezava se na 10 s, Ctrl+C za kraj)"; sleep 10; done
fi

env_get() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; B=$'\e[1m'; N=$'\e[0m'; else G=; Y=; R=; B=; N=; fi
WARN=0; FAIL=0
ok()   { printf '  %s[ OK ]%s %s\n' "$G" "$N" "$1"; }
warn() { printf '  %s[WARN]%s %s\n' "$Y" "$N" "$1"; WARN=$((WARN+1)); }
bad()  { printf '  %s[ !! ]%s %s\n' "$R" "$N" "$1"; FAIL=$((FAIL+1)); }
head_() { printf '\n%s%s%s\n' "$B" "$1" "$N"; }

printf '%sELGOR ServiceHub - stanje sistema%s   %s\n' "$B" "$N" "$(date '+%F %T')"

head_ "Kontejneri"
DOCKER_OK=1
if ! docker compose ps >/dev/null 2>&1; then
  DOCKER_OK=0
  bad "docker compose ne radi (Docker ugasen ili pogresan folder?)"
else
  for svc in postgres java caddy; do
    line="$(docker compose ps --format '{{.Service}}|{{.State}}|{{.Health}}|{{.Status}}' 2>/dev/null | grep "^$svc|" || true)"
    if [ -z "$line" ]; then bad "$svc: ne postoji (nije pokrenut)"; continue; fi
    state="$(echo "$line" | cut -d'|' -f2)"; health="$(echo "$line" | cut -d'|' -f3)"; st="$(echo "$line" | cut -d'|' -f4)"
    if [ "$state" != "running" ]; then bad "$svc: $state"
    elif [ -n "$health" ] && [ "$health" != "healthy" ]; then warn "$svc: $health ($st)"
    else ok "$svc: $st"; fi
  done
  if [ -n "$(env_get CLOUDFLARE_TUNNEL_TOKEN)" ]; then
    line="$(docker compose ps --format '{{.Service}}|{{.State}}|{{.Status}}' cloudflared 2>/dev/null | head -1)"
    case "$line" in cloudflared\|running*) ok "tunel: ${line##*|}";; *) bad "tunel (cloudflared) ne radi";; esac
  fi
fi

head_ "Aplikacija"
if docker compose exec -T caddy wget -qO- --timeout=5 http://java:8081/api/health 2>/dev/null | grep -q .; then
  ok "backend odgovara (/api/health)"
else
  bad "backend NE odgovara"
fi
code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost/api/health 2>/dev/null || true)"
if [ -n "$code" ] && [ "$code" != "000" ]; then ok "web server odgovara (HTTP $code)"; else bad "web server (caddy) ne odgovara na portu 80"; fi
URL="$(env_get PUBLIC_URL)"
case "$URL" in
  https://*) if curl -fsS -o /dev/null -m 10 "$URL/api/health" 2>/dev/null; then ok "spolja dostupno: $URL"; else bad "SPOLJA NIJE DOSTUPNO: $URL (tunel/DNS/internet)"; fi ;;
  *) ok "javna adresa nije podesena (rad samo u lokalnoj mrezi)" ;;
esac

head_ "Baza"
q() { docker compose exec -T postgres psql -U elgor -d elgor_nalog -Atc "$1" 2>/dev/null; }
if n="$(q "select count(*) from nalog")" && [ -n "$n" ]; then
  open_n="$(q "select count(*) from nalog where status in ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS')")"
  users="$(q "select count(*) from app_user where active")"
  size="$(q "select pg_size_pretty(pg_database_size('elgor_nalog'))")"
  ok "nalozi: $n (otvorenih: $open_n), aktivnih naloga korisnika: $users, velicina baze: $size"
  # nalozi koje niko nije dodirnuo duze od STALE_DAYS (isto kao kartica "Zaboravljeni nalozi")
  days="$(env_get STALE_DAYS)"; days="${days:-2}"
  stale="$(q "select count(*) from nalog where status in ('DISPATCHED','IN_PROGRESS') and updated_at < now() - interval '$days days'")"
  if [ "${stale:-0}" -gt 0 ]; then warn "zaboravljenih naloga (bez promene $days+ dana): $stale"; else ok "nema zaboravljenih naloga"; fi
else
  bad "baza ne odgovara"
fi

head_ "Backup"
BK="$(env_get BACKUP_DIR)"
if [ -z "$BK" ]; then warn "BACKUP_DIR nije podesen u .env"
elif [ ! -d "$BK" ]; then bad "folder za backup ne postoji ili disk nije montiran: $BK"
else
  last="$(ls -1d "$BK"/20??-??-?? 2>/dev/null | tail -1)"
  if [ -z "$last" ]; then bad "u $BK nema nijednog backupa"
  else
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 ))
    dump="$last/postgres.dump"
    if [ ! -s "$dump" ]; then bad "poslednji backup ($(basename "$last")) nema ispravan postgres.dump"
    elif [ "$age_h" -gt 50 ]; then bad "poslednji backup je star ${age_h} h ($(basename "$last"))"
    elif [ "$age_h" -gt 30 ]; then warn "poslednji backup je star ${age_h} h ($(basename "$last"))"
    else ok "poslednji backup: $(basename "$last"), pre ${age_h} h, dump $(du -h "$dump" | cut -f1)"; fi
  fi
fi

head_ "Disk, memorija, greske"
disk_check() {
  [ -e "$2" ] || return 0
  pct="$(df --output=pcent "$2" 2>/dev/null | tail -1 | tr -dc '0-9')"
  [ -z "$pct" ] && return 0
  if [ "$pct" -ge 95 ]; then bad "$1: $pct% pun"; elif [ "$pct" -ge 85 ]; then warn "$1: $pct% pun"; else ok "$1: $pct% zauzeto"; fi
}
DD="$(env_get DATA_DIR)"; disk_check "disk sa podacima" "${DD:-./data}"
[ -n "$BK" ] && disk_check "disk za backup" "$BK"
mem="$(free -m | awk '/Mem:/ {printf "%d", $7*100/$2}')"
if [ -n "$mem" ]; then
  if [ "$mem" -lt 8 ]; then warn "malo slobodne memorije: ${mem}% dostupno"; else ok "memorija: ${mem}% dostupno"; fi
fi
errs="$(docker compose logs --since 24h java 2>/dev/null | grep -c ' ERROR ' || true)"
if [ "$DOCKER_OK" = 0 ]; then :
elif [ "${errs:-0}" -gt 0 ]; then warn "backend: $errs ERROR redova u poslednja 24 h (docker compose logs --since 24h java | grep ERROR)"; else ok "backend: nema gresaka u poslednja 24 h"; fi
[ -f /var/run/reboot-required ] && warn "sistem trazi restart (azuriranja)"
if command -v upsc >/dev/null 2>&1; then
  ups="$(upsc -l 2>/dev/null | head -1)"
  if [ -n "$ups" ]; then
    st="$(upsc "$ups" ups.status 2>/dev/null)"; ch="$(upsc "$ups" battery.charge 2>/dev/null)"
    case "$st" in OL*) ok "UPS: na mrezi, baterija ${ch:-?}%";; "") warn "UPS: nema odgovora";; *) bad "UPS: $st (baterija ${ch:-?}%) - nestalo struje?";; esac
  fi
fi

echo
if [ "$FAIL" -gt 0 ]; then printf '%s%sGRESKE: %s, upozorenja: %s%s\n' "$R" "$B" "$FAIL" "$WARN" "$N"; exit 2
elif [ "$WARN" -gt 0 ]; then printf '%s%sUPOZORENJA: %s%s\n' "$Y" "$B" "$WARN" "$N"; exit 1
else printf '%s%sSVE RADI%s\n' "$G" "$B" "$N"; fi
