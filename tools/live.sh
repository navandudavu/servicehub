#!/usr/bin/env bash
# Live pregled u terminalu, osvezava se svake sekunde (Ctrl+C za kraj). Samo cita, nista ne menja.
#   bash tools/live.sh          osvezavanje na 1 s
#   bash tools/live.sh 3        osvezavanje na 3 s
cd "$(dirname "$0")/.."
EVERY="${1:-1}"
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; B=$'\e[1m'; D=$'\e[2m'; N=$'\e[0m'; else G=; Y=; R=; B=; D=; N=; fi
trap 'tput cnorm 2>/dev/null; printf "\n"; exit 0' INT TERM
tput civis 2>/dev/null; clear

q() { docker compose exec -T postgres psql -U elgor -d elgor_nalog -Atc "$1" 2>/dev/null; }
COLS="$(tput cols 2>/dev/null || echo 120)"

frame() {
  printf '%sELGOR ServiceHub - uzivo%s   %s   %s(osvezavanje %s s, Ctrl+C za kraj)%s\n\n' "$B" "$N" "$(date '+%F %T')" "$D" "$EVERY" "$N"

  printf '%sKontejneri%s\n' "$B" "$N"
  for svc in postgres java caddy; do
    line="$(docker compose ps --format '{{.Service}}|{{.State}}|{{.Health}}|{{.Status}}' 2>/dev/null | grep "^$svc|")"
    if [ -z "$line" ]; then printf '  %s[ !! ]%s %-9s nije pokrenut\n' "$R" "$N" "$svc"; continue; fi
    state="$(cut -d'|' -f2 <<<"$line")"; health="$(cut -d'|' -f3 <<<"$line")"; st="$(cut -d'|' -f4 <<<"$line")"
    if [ "$state" != "running" ]; then printf '  %s[ !! ]%s %-9s %s\n' "$R" "$N" "$svc" "$st"
    elif [ -n "$health" ] && [ "$health" != "healthy" ]; then printf '  %s[WARN]%s %-9s %s\n' "$Y" "$N" "$svc" "$st"
    else printf '  %s[ OK ]%s %-9s %s\n' "$G" "$N" "$svc" "$st"; fi
  done

  code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://localhost/api/health 2>/dev/null)"
  if [ "$code" = "200" ]; then printf '  %s[ OK ]%s web + backend odgovaraju (HTTP 200)\n' "$G" "$N"
  else printf '  %s[ !! ]%s web/backend ne odgovara (HTTP %s)\n' "$R" "$N" "${code:-000}"; fi

  printf '\n%sNalozi%s\n' "$B" "$N"
  rows="$(q "select status, count(*) from nalog group by status order by status")"
  if [ -z "$rows" ] && ! q "select 1" >/dev/null; then printf '  %s[ !! ]%s baza ne odgovara\n' "$R" "$N"
  elif [ -z "$rows" ]; then printf '  nema naloga\n'
  else tr '|' ' ' <<<"$rows" | awk '{printf "  %-20s %s\n", $1, $2}'; fi
  printf '  %-20s %s\n' "ukupno" "$(q "select count(*) from nalog")"

  printf '\n%sPoslednjih 10 dogadjaja (nalozi i magacin)%s\n' "$B" "$N"
  q "select to_char(happened_at at time zone 'Europe/Belgrade','HH24:MI:SS')||'  '||coalesce(actor_name,'-')||'  '||kind||'  '||coalesce(detail,'') from nalog_event order by id desc limit 10" \
    | cut -c1-$((COLS-4)) | sed 's/^/  /'

  printf '\n%sBackend log (poslednjih 12 redova)%s\n' "$B" "$N"
  docker compose logs --tail 12 --no-log-prefix java 2>/dev/null | cut -c1-$((COLS-4)) | while IFS= read -r l; do
    case "$l" in
      *" ERROR "*) printf '  %s%s%s\n' "$R" "$l" "$N" ;;
      *" WARN "*)  printf '  %s%s%s\n' "$Y" "$l" "$N" ;;
      *)           printf '  %s%s%s\n' "$D" "$l" "$N" ;;
    esac
  done
}

while true; do
  out="$(frame 2>&1)"
  tput cup 0 0 2>/dev/null          # draw over the old screen instead of clearing it: no flicker
  printf '%s\n' "$out" | sed 's/$/\x1b[K/'
  tput ed 2>/dev/null               # erase whatever is left of the previous, longer frame
  sleep "$EVERY"
done
