# Postavljanje na server (Ubuntu + Docker)

Jedan namenski racunar, UPS, Docker. Spolja je dostupan samo Caddy (80/443); Postgres, Node i Java su na internoj Docker mrezi.

> Ništa od ovoga nije pokrenuto ni testirano na pravom Docker-u (razvojno okruženje nema Docker daemon). Prvo pokretanje radite uz nadzor, a **backup i restore isprobajte pre nego što iko počne da radi u sistemu.**

## 1. Racunar

- Ubuntu Server LTS, SSD, instaliran Docker Engine (https://docs.docker.com/engine/install/ubuntu/), korisnik u grupi `docker`.
- BIOS: **Restore on AC Power Loss = Power On**, da se racunar sam podigne posle nestanka struje.
- Fiksna adresa u lokalnoj mrezi (rezervacija na ruteru). Windows + Docker Desktop za server ne preporucujem.

## 2. Instalacija

```bash
sudo mkdir -p /opt && sudo chown $USER /opt
git clone https://github.com/navandudavu/servicehub.git /opt/servicehub
cd /opt/servicehub
bash deploy/setup.sh        # pravi .env sa novim tajnama i fascikle sa pravim vlasnistvom
nano .env                   # vidi dole
docker compose up -d --build
docker compose ps           # sve 'healthy'/'running'
```

Docker servisi imaju `restart: unless-stopped`, a Docker se na Ubuntu-u sam podize pri startu, pa se ceo sistem sam vraca posle restarta.

### Prvi admin nalog / stari podaci

Stare podatke (SQLite → Postgres) prenosi `tools/migrate-sqlite-to-postgres.js`, isto kao u razvoju. Ako nemate stare podatke, napravite prvog admina:

```bash
docker compose exec node node src/db/seed.js
```

Skripta ispisuje email (`admin@servicehub.local`) i **nasumicnu lozinku, samo jednom**: zapisite je i odmah je promenite posle prve prijave (link *promeni lozinku*). Prijava je ogranicena na 8 pogresnih pokusaja po IP adresi i emailu (i 40 po IP adresi) u 15 minuta.

### Sta podesiti u `.env`

| Promenljiva | Sta znaci |
|---|---|
| `SITE_ADDRESS` | domen (`servis.vasafirma.rs`) → automatski HTTPS; ili `:80` iza tunela / za test u LAN-u |
| `PUBLIC_URL` | kako telefoni/browser dolaze do servera, npr. `https://servis.vasafirma.rs` |
| `LABOR_RATE`, `VAT_RATE` | prave cene (neto, bez PDV-a) i PDV, bez rebuild-a |
| `BACKUP_DIR`, `REQUIRE_MOUNT` | gde ide backup (**drugi disk**) i putanja tacke montiranja tog diska |
| `BACKUP_REMOTE` | opciono: rsync odrediste van racunara |

`DB_PASSWORD` i `JWT_SECRET` generise `setup.sh`. Promena `JWT_SECRET` odjavljuje sve.

## 3. Pristup spolja

Prvo proverite da li je internet iza CGNAT-a: na ruteru pogledajte WAN IP adresu i uporedite je sa onom koju vidi npr. `curl ifconfig.me`. Ako se razlikuju (ili je WAN u opsegu `100.64.x.x`–`100.127.x.x` ili `10.x`/`192.168.x`), **CGNAT je** i port-forwarding nece raditi.

**A) Javna IP adresa + domen:** na ruteru prosledite portove 80 i 443 na ovaj racunar, DNS A-zapis domena usmerite na javnu IP, `SITE_ADDRESS=vas.domen.rs`. Caddy sam nabavlja i obnavlja sertifikat. (Ako IP nije fiksna, treba dinamicki DNS.)

**B) CGNAT → Cloudflare Tunnel (besplatno, zahteva domen u Cloudflare-u):**
1. Cloudflare Zero Trust → Networks → Tunnels → Create tunnel → kopirajte token.
2. U tunelu dodajte *Public hostname*: `servis.vasafirma.rs` → servis `HTTP` → `caddy:80`.
3. U `.env`: `SITE_ADDRESS=:80`, `PUBLIC_URL=https://servis.vasafirma.rs`, `CLOUDFLARE_TUNNEL_TOKEN=...`
4. `docker compose --profile tunnel up -d`. HTTPS radi Cloudflare, portovi na ruteru se ne diraju.

Android aplikacija: u podesavanju servera upisite `PUBLIC_URL` (bez `:4000`). Sve ide kroz jednu adresu, Caddy sam razdvaja Node i Java.

### Push obavestenja (dodeljen nalog)

Kad admin dodeli nalog tehnicaru, telefon dobija notifikaciju. Node salje preko Firebase-a, pa treba `secrets/firebase-service-account.json` (iz Firebase konzole: Project settings → Service accounts). Bez tog fajla sve ostalo radi, samo nema notifikacija (Java to ne primeti, greska se samo upisuje u log). Iskljucivanje: `NALOG_PUSH_ENABLED=false`.

## 4. Backup (obavezno)

```bash
bash deploy/backup.sh       # rucno, za probu
```

Cuva: Postgres dump, SQLite (nalozi korisnika i stari poslovi, online backup) i fotografije (hard-link snimci, zauzimaju samo novo) u `$BACKUP_DIR/YYYY-MM-DD/`; brise snimke starije od 30 dana (`KEEP_DAYS`).

Nocni raspored (02:30, nadoknadjuje se ako je racunar bio ugasen):

```bash
sudo cp deploy/elgor-backup.service deploy/elgor-backup.timer /etc/systemd/system/
# ako repozitorijum nije u /opt/servicehub, izmenite putanje u .service fajlu
sudo systemctl daemon-reload
sudo systemctl enable --now elgor-backup.timer
systemctl list-timers elgor-backup.timer     # provera
journalctl -u elgor-backup.service -n 30     # rezultat poslednjeg backup-a
```

Backup na istom disku kao podaci nije backup. Stavite `BACKUP_DIR` na drugi disk **i** povremeno odnesite kopiju van kancelarije (USB disk kuci, ili `BACKUP_REMOTE`).

**Restore** (probajte ga bar jednom na drugom racunaru ili posle probnog backup-a):

```bash
bash deploy/restore.sh /mnt/backup/elgor/2026-11-03
```

## 5. UPS (NUT: cist shutdown pri praznoj bateriji)

UPS sam po sebi samo kupuje vreme. Bez softvera racunar se na kraju ipak ugasi naglo. Za USB UPS:

```bash
sudo apt install nut
sudo nut-scanner -U          # pokaze driver i port za vas UPS
```

`/etc/nut/nut.conf`:
```
MODE=standalone
```
`/etc/nut/ups.conf` (driver iz nut-scanner, najcesce `usbhid-ups`):
```
[ups]
  driver = usbhid-ups
  port = auto
```
`/etc/nut/upsd.users`:
```
[upsmon]
  password = IZABERITE_LOZINKU
  upsmon master
```
`/etc/nut/upsmon.conf` (dodati/izmeniti):
```
MONITOR ups@localhost 1 upsmon IZABERITE_LOZINKU master
SHUTDOWNCMD "/sbin/shutdown -h +0"
```
```bash
sudo systemctl restart nut-server nut-monitor
upsc ups                     # treba da ispise stanje UPS-a (battery.charge, ups.status...)
```
Test: izvucite UPS iz struje na minut i gledajte `upsc ups ups.status` (`OB` = na bateriji). Posle povratka struje racunar se podize sam (BIOS opcija iz koraka 1), a Docker pokrece servise. Koliko UPS izdrzi zavisi od modela i opterecenja: izmerite, nemojte pretpostavljati.

## 6. Odrzavanje

```bash
docker compose ps
docker compose logs -f java          # ili node / caddy / postgres
git pull && docker compose up -d --build    # nova verzija; migracije baze idu same
```
Pre svake nove verzije napravite `bash deploy/backup.sh`.

Podaci su u `DATA_DIR` (`./data`): `postgres/`, `node/`, `photos/`. Ne brisati, ne ukljucivati u git.
