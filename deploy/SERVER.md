# Konfiguracija servera (hardver + operativni sistem)

Ovo je sloj ispod `DEPLOY.md`: šta kupiti/pripremiti i kako postaviti Ubuntu, pa tek onda `DEPLOY.md` (Docker, `.env`, backup, UPS, tunel). Opterećenje je malo (oko 10 korisnika, jedna baza, jedan Java servis), pa je cilj **pouzdanost, ne snaga**.

> Ništa od ovoga nije isprobano na pravom hardveru. Prvo postavljanje radite uz nadzor, a backup i restore isprobajte pre nego što iko počne da radi u sistemu.

## 1. Hardver

| Deo | Preporuka | Napomena |
|---|---|---|
| CPU | 4 jezgra, bilo šta novije od ~8 godina | Opterećenje je zanemarljivo |
| RAM | 16 GB (8 GB je minimum) | ECC je lepo, nije obavezan |
| Diskovi | 2 × SSD 240–500 GB u RAID1 (ogledalo) | 50.000 naloga je ispod 1 GB; ogledalo je zbog otkaza, ne zbog prostora |
| Disk za backup | **Treći, poseban disk** (HDD/SSD) | Backup na istom disku nije backup |
| Napajanje | Dupli PSU ako ga server ima, na UPS-u | Online (dvostruka konverzija) UPS ako budžet dozvoljava |
| Mreža | Žičani gigabit, fiksna adresa (rezervacija na ruteru) | Wi-Fi ne za server |

**Rack napomena:** pravi 1U/2U server je glasan i troši 100–200 W stalno. U kancelariji gde ljudi sede to dosadi za nedelju dana. Ako server ide u ormar/prostoriju, nema problema; ako ne, tih toranj ili mali moderan računar na rack polici radi isti posao.

**BIOS/UEFI:**
- **Restore on AC Power Loss = Power On** (sam se podigne posle nestanka struje).
- Uključena virtualizacija nije potrebna (bez VM-ova, samo Docker).
- Ako server ima iDRAC/iLO/IPMI: promenite podrazumevanu lozinku i **ne izlažite ga na internet**, samo u lokalnoj mreži.

## 2. Instalacija Ubuntu Server 24.04 LTS

1. Boot sa USB-a, instalacija **Ubuntu Server** (bez desktop okruženja).
2. Storage: ručno particionisanje ili "custom storage layout" instalera:
   - na oba SSD-a napraviti po jednu EFI particiju (ili jednu EFI + kopija) i po jednu particiju za RAID;
   - od dve RAID particije napraviti **RAID1 (md)**, na njemu ext4 za `/`.
   - Ako ne želite da se petljate: jedan SSD za sistem + redovan backup na drugi disk je prihvatljivo, samo je oporavak duži.
3. Uključite **OpenSSH server** u instalaciji.
4. Hostname npr. `elgor-server`, korisnik koji **nije** `admin`/`root`.
5. Posle prvog boot-a:
   ```bash
   sudo apt update && sudo apt -y full-upgrade
   sudo reboot
   ```

Provera RAID-a (ako ste ga pravili):
```bash
cat /proc/mdstat           # [UU] = oba diska žive, [U_] = jedan je ispao
sudo mdadm --detail /dev/md0
```

## 3. Osnovno učvršćivanje

### SSH samo sa ključem
Sa svog računara: `ssh-copy-id korisnik@IP_SERVERA`. Zatim na serveru:

```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin no
EOF
sudo systemctl reload ssh
```
**Pre nego što zatvorite postojeću sesiju**, u novom prozoru proverite da se ključem možete prijaviti.

### Firewall
Spolja su potrebni samo 80/443 (ili ništa, ako koristite Cloudflare Tunnel), plus SSH iz lokalne mreže:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp    # prilagodite svojoj podmreži
sudo ufw allow 80/tcp                                           # samo ako NE koristite tunel
sudo ufw allow 443/tcp                                          # samo ako NE koristite tunel
sudo ufw enable
sudo ufw status verbose
```
> **Pažnja:** Docker objavljene portove ubacuje direktno u iptables i **zaobilazi ufw**. `docker-compose.yml` zato objavljuje samo Caddy (80/443); Postgres i Java ne smeju dobiti `ports:` ka spolja. Ako ikada dodate `ports:` nekom servisu, ufw vas neće zaštititi.

Za udaljeni pristup SSH-u bez otvaranja porta: Tailscale (`curl -fsSL https://tailscale.com/install.sh | sh`, pa `sudo tailscale up`) ili SSH kroz Cloudflare Tunnel. Ne otvarajte 22 ka internetu.

### Automatske bezbednosne zakrpe
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```
Kernel zakrpe traže restart; dogovorite prozor (npr. nedelja uveče) i obavestite korisnike. Docker se sam podiže (`restart: unless-stopped`).

### Vreme
```bash
timedatectl set-timezone Europe/Belgrade
timedatectl status         # "System clock synchronized: yes"
```
Podsetnik u 22:00 i backup u 02:30 zavise od tačnog vremena.

## 4. Docker i aplikacija

Instalirajte **Docker Engine** (ne Docker Desktop): https://docs.docker.com/engine/install/ubuntu/, pa:
```bash
sudo usermod -aG docker $USER      # odjavite se i prijavite ponovo
sudo systemctl enable --now docker
```
Zatim **sve iz `DEPLOY.md`**: `setup.sh`, `.env`, `docker compose up -d --build`, pristup spolja, backup, UPS.

Logovi kontejnera su već ograničeni u `docker-compose.yml` (rotacija), pa ne mogu napuniti disk.

## 5. Nadzor diskova

```bash
sudo apt install -y smartmontools
sudo smartctl -H /dev/sda        # ponovite za svaki disk; očekuje se "PASSED"
```
`smartd` može da šalje mejl pri problemu; makar jednom mesečno pogledajte `smartctl -a` i `cat /proc/mdstat`. `deploy/status.sh` prikazuje zauzeće diska i starost backup-a.

## 6. Lista za prijem (pre nego što korisnici krenu)

- [ ] Server se sam podiže posle nestanka struje (izvucite kabl, vratite ga).
- [ ] `docker compose ps` pokazuje sve servise kao `healthy`/`running` posle restarta.
- [ ] SSH radi samo ključem; `ufw status` pokazuje očekivana pravila.
- [ ] `bash deploy/backup.sh` pravi snimak na **drugom** disku; `systemctl list-timers elgor-backup.timer` pokazuje sledeće izvršavanje.
- [ ] **Restore isproban** (`bash deploy/restore.sh ...`, najbolje na drugom računaru) i podaci se vide u aplikaciji.
- [ ] Jedan disk RAID-a je privremeno izvučen i sistem je nastavio da radi (samo ako ste pravili RAID).
- [ ] UPS: `upsc ups` stanje se čita; test prekida struje gasi server čisto.
- [ ] Spoljni monitor (UptimeRobot) gleda `https://VASA-ADRESA/api/health`.
- [ ] Tajne promenjene u odnosu na test (`setup.sh` na novom `.env`), prvi admin promenio lozinku.
- [ ] Kopija backup-a se povremeno odnosi van kancelarije.
