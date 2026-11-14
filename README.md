# ELGOR ServiceHub

Interni alat firme ELGOR (Kruševac) za vođenje servisa bele tehnike i klima uređaja: radni nalozi, magacin delova, klijenti, serviseri, fotografije i konstatacije sa terena, zaduživanje materijala, kalendar i izveštaji. Dvojezičan (srpski/engleski), za administratore, menadžere i servisere. Računa se na oko 10 korisnika (±2) i jedan server.

> Stanje: u razvoju, još nije u produkciji. Pre prave upotrebe pročitajte odeljke **Bezbednost** i **Šta još nedostaje**.

U ovom dokumentu „administrator“ znači i menadžera, osim gde je izričito rečeno drugačije (kartica *Tim* je samo za administratora, vidi **Uloge**).

## Od čega se sastoji

| Deo | Tehnologija | Folder | Port (razvoj) |
|---|---|---|---|
| Web aplikacija | React + Vite (JS i TypeScript) | `frontend/` | 5173 |
| **Server (jedini backend): prijava, tim, klijenti, nalozi, magacin, obaveštenja** | Java 17 + Spring Boot 3 + PostgreSQL | `backend-java/` | 8081 |
| Uvoz starih poslova u nove naloge | Node skripta | `tools/` | – |
| Android aplikacija za servisere i administratore | Kotlin + Jetpack Compose | poseban repozitorijum `elgor_technician` | – |
| Postavljanje na server | Docker Compose + Caddy, skripte | `deploy/` (`DEPLOY.md`, `SERVER.md`) | 80 / 443 |

Postoji **jedan backend** (Java). Prijava, nalozi korisnika, tim, klijenti, nalozi, magacin, zaduživanje, fotografije i push obaveštenja žive u njemu i u jednoj PostgreSQL bazi. Stari Node/SQLite server je uklonjen (vidi **Prelazak sa starog Node servera**).

Prijava izdaje JWT (HS256, `{id, role, name}`, važi 12 h, potpisan sa `JWT_SECRET`); pri svakom zahtevu server proverava da nalog još postoji, aktivan je, ima istu ulogu i da token nije stariji od poslednje promene lozinke (vidi **Sesije i tokeni**).

Vite razvojni server prosleđuje ceo `/api` na Javu (8081). U produkciji isto radi Caddy (`deploy/Caddyfile`).

## Radni nalog (nalog)

Svaki nalog beleži: klijenta (ime, adresa, telefon, napomene o lokaciji), uređaj (tip, marka, model, serijski broj), dijagnozu, **izvršene radove**, ugrađene delove iz magacina, sate rada, **ručno upisanu cenu**, način plaćanja (gotovina / kartica / virman), planirani dolazak (samo datum) i status. **Naloge pravi samo administrator**; serviser radi nalog koji mu je dodeljen.

**Statusi:** Nacrt → Dodeljen → bilo koji radni status → Završen.
- **Radni statusi:** *U toku*, *Čeka delove*, *Preuzet u servis* (za njega se štampa **revers**), *Testira se*, *Vozi se*, *Potreban elektroničar*. Između radnih statusa se prelazi slobodno, bilo kojim redom.
- **Završen** traži uslove iz odeljka **Zatvaranje naloga**.
- **Otkazivanje** samo administrator, iz bilo kog nezavršenog statusa; vraća delove na stanje.
- *Završen* i *Otkazan* su konačni (nema ponovnog otvaranja).

**Pravila koja server sam sprovodi (ne samo interfejs):**
- **Novac se računa isključivo u Javi** (`BigDecimal`, zaokruživanje `HALF_UP`, 2 decimale); frontend samo šalje količine i ručno upisanu cenu i prikazuje rezultat, a iznosi putuju kao stringovi (`"7462.92"`), nikad kao decimalni brojevi.
- Svaka izmena podataka je u jednoj transakciji sa potpunim vraćanjem (npr. oduzimanje delova + upis naloga + istorija statusa).
- Dva servisera ne mogu uzeti poslednji deo istovremeno (zaključavanje redova, redosled po id-ju bez zastoja); drugi dobija jasnu grešku 409.
- Ponovljeno slanje istog formulara ne pravi dupli nalog (`Idempotency-Key`).
- Serviser vidi samo naloge dodeljene njemu; tuđi nalog daje 404.
- Greške su u RFC 7807 obliku, bez internih detalja; nedostatak dozvole je uvek 403.

### Izmena i brisanje naloga

Izmena: svi nalozi osim **otkazanih**; **završen** nalog sme da menja samo administrator. Brisanje: samo administrator, ne za završene.

- **Izmena** (dugme *Izmeni* na stranici naloga; administrator bilo koji, serviser samo svoj nezavršen): klijent, uređaj, dijagnoza, izvršeni radovi, delovi, sati, cena, plaćanje, planirani dolazak. Status i dodela imaju svoja dugmad. Otkazani nalog se ne menja (delovi su mu već vraćeni). Delove na završenom nalogu sme da menja samo administrator.
  - U magacinu se pomera samo **razlika** (sa 2 na 5 komada uzima još 3; uklanjanje dela ga vraća), svako pomeranje ide u istoriju dela.
  - Cena naloga se upisuje **ručno** (jedan iznos, najviše 8 cifara i 2 decimale; bez satnice, PDV-a i zbira delova). Sati rada se i dalje unose i vode, a delovi na nalogu služe samo za stanje magacina. Ako se pri izmeni cena ne pošalje, nalog zadržava svoju cenu.
  - **Izvršeni radovi** (do 4000 znakova) mogu i zasebno, bez celog formulara: `PATCH /api/nalozi/{id}/work-done` (tako ih menja Android aplikacija). Pravilo pristupa je isto: dodeljeni serviser ili administrator; na završenom nalogu samo administrator; na otkazanom niko.
  - Ako je neko drugi u međuvremenu izmenio nalog, čuvanje daje 409 („učitajte ponovo“) umesto da pregazi njegov rad.
  - Izmena podataka o klijentu pravi **ispravljeni zapis klijenta samo za taj nalog**; stari nalozi zadržavaju originalne podatke (zato ostaje duplikat u listi klijenata).
- **Brisanje** (dugme *Obriši*, samo administrator, uz potvrdu): delovi se vraćaju na stanje (otkazani nalog ih je već vratio), brišu se fotografije (fajlovi tek nakon uspešnog brisanja), konstatacije i istorija. Ostaje zapis ko je šta i kada obrisao (`nalog_deleted_log`).
- Ako ponovo pokrenete uvoz starih poslova, obrisani uvezeni nalozi bi se ponovo pojavili.

### Fotografije i konstatacije

**Fotografije:** JPEG/PNG/WebP do 10 MB, vrsta se određuje po stvarnom sadržaju fajla (ne po imenu), čuvaju se na disku pod nasumičnim imenom (`NALOG_PHOTOS_DIR`), vide se samo uz prijavu. Kategorije: **Pre**, **Posle**, **Nalepnica / SN**, **Radni nalog** (slika papirnog naloga) i **Ostalo**. Brisanje: administrator ili osoba koja je otpremila. Android aplikacija pre slanja smanjuje sliku (najviše 1920 px, JPEG).

**Automatsko osvežavanje:** stranica naloga (status, istorija, fotografije, konstatacije) osvežava se sama na 10 s, lista naloga na 20 s, a Pregled na 30 s, samo dok je kartica vidljiva (i odmah kad se vratite na nju). Ne radi se dok traje neka vaša radnja na stranici. Kalendar (prikazana nedelja) na 30 s. Android aplikacija se osvežava dugmetom na listi.

**Konstatacije** (ranije „beleške“): slobodan tekst (do 2000 znakova, najviše 200 po nalogu) sa autorom i vremenom; vide ih svi koji vide nalog. Ne mogu se menjati (ispravka = nova beleška), briše ih samo administrator. Dozvoljene su na svakom nalogu osim **završenog**: tamo su samo za čitanje (dodavanje i brisanje daju 409, i administratoru); na otkazanom su i dalje dozvoljene. (U API-ju i bazi putanja je i dalje `/notes`.)

### Magacin delova (stranica *Magacin*, ranije *Delovi*)

Lista sa pretragom i prikazom ukinutih delova, novi deo, izmena (naziv, cena, aktivan), korekcija stanja sa napomenom i **istorija stanja** (ko je, kada i zašto promenio: početno stanje, ručna korekcija, utrošeno na nalogu, nalog otkazan / izmenjen / obrisan). Promena cene važi samo za nove naloge. Ukinut deo se ne može dodati na novi nalog. **Svi prijavljeni (i serviseri) vide ceo magacin, koriguju stanje i vide istoriju stanja** (svaka korekcija se upisuje sa imenom onoga ko je uradio; stanje ne može ispod nule). Novi deo, izmenu dela (naziv, cena, aktivan) i grupno aktiviranje rade samo administrator i menadžer.

### Podsetnik za status

- **Svakog punog sata od 08:00 do 19:00, ponedeljak–subota** (vreme Beograda) server šalje push svakom aktivnom serviseru koji ima nalog u bilo kom statusu osim *Nacrt*, *Završen* i *Otkazan* (dakle *Dodeljen* ili neki radni status): „Imate otvorenih naloga: N. Izaberite trenutni status svakog naloga.“ Podsetnik samo podseća, ništa ne menja. Vreme se menja u `.env` (`REMINDER_CRON`, Spring cron; ako je `.env` ranije kopiran sa starom vrednošću `0 0 22 * * MON-SAT`, promenite i tamo), a gasi se sa `REMINDER_ENABLED=false`.
- Automatskog zatvaranja nema, a kartica „Zaboravljeni nalozi“ je uklonjena.

### Zatvaranje naloga

Nalog se ne može zatvoriti (*Završen*) bez bar jedne fotografije kategorije *Pre*, bar jedne kategorije *Posle* i bez opisa **izvršenih radova**; server odbija zatvaranje sa porukom. Fotografija iz neke druge kategorije ne računa se. Serviser više ne može da menja zatvoren nalog; administrator može (delovi na zatvorenom nalogu samo on).

### Pregled, kalendar, izveštaji

Kontrolna tabla i Kalendar čitaju naloge; administrator zakazuje planirani dolazak na stranici naloga ili u formularu — **samo datum, bez sata** (čuva se kao podne tog dana po lokalnom vremenu da dan ne bi „skliznuo“ pri pretvaranju vremenskih zona); kalendar prikazuje najviše 62 dana odjednom. **Izveštaji** (samo administrator): promet završenih naloga po serviseru / mesecu / načinu plaćanja i CSV izvoz (tačka-zarez, decimalni zarez, otvara se u srpskom Excelu).

### Zaduživanje

Kartica **Zaduživanje** (svi korisnici): lista materijala koji serviser nosi sa sobom (šifra nije obavezna, naziv, količina), najviše **50 stavki po serviseru**. Serviser vodi samo svoju listu, administrator i menadžer bilo čiju (biraju servisera). Nije povezano sa magacinom i ne pomera zalihe. Dugme *Štampaj* otvara dokument „Zaduženje materijala“ za štampu (API: `/api/carried`). Ista lista je i u Android aplikaciji, gde štampač otvara sistemski dijalog za štampu (A4 ili PDF).

## Uloge

- **Administrator**: sve, uključujući karticu *Tim* (nalozi korisnika, uloge, lozinke).
- **Menadžer**: sve što i administrator (nalozi, delovi, klijenti, izveštaji, brisanja), osim *Tima*. Server odbija sve izmene `/api/users` za menadžera, a kartica se ne prikazuje.
- **Serviser**: samo svoji (dodeljeni) nalozi; ne pravi naloge, nema stranicu *Izveštaji*; vidi ceo *Magacin* i koriguje stanje (ne pravi i ne menja delove); vodi svoje zaduženje.

## API

**Nalozi korisnika** (iste putanje i oblici kao nekada u Node-u):

| Metoda | Putanja | Ko |
|---|---|---|
| POST | `/api/auth/login` | svi (javno; ograničenje pokušaja) |
| GET | `/api/auth/me` | prijavljen |
| POST | `/api/auth/token` | prijavljen – FCM token telefona |
| GET | `/api/health` | javno |
| GET | `/api/users` | prijavljen |
| POST, DELETE | `/api/users`, `/api/users/{id}` | samo administrator, ne menadžer (ne može se obrisati sebe ni poslednji admin) |
| PUT | `/api/users/{id}` | administrator ili sam korisnik |
| PATCH | `/api/users/{id}/active`, `/{id}/reset-password` | samo administrator (poslednji aktivan admin se ne može deaktivirati) |
| PATCH | `/api/users/me/password` | prijavljen – vraća svež token |

**Klijenti** (`/api/customers`): GET lista (`?q=` traži po imenu, telefonu, adresi i gradu), GET `/{id}` (sa istorijom naloga; serviser vidi samo svoje), POST i PUT (svi), DELETE (admin; 409 ako klijent ima naloge). Postoji **jedna** tabela klijenata, ista kao u formularu naloga.

**Grupne akcije** (samo administrator; na listama Radni nalozi, Delovi i Klijenti kvačice po redu i „izaberi sve“ za redove na ekranu, kao u Gmail-u; najviše 200 stavki):
- `POST /api/nalozi/bulk-delete` `{ids}` – sve ili ništa: ako je bilo koji nalog *Završen*, ništa se ne briše (odgovor navodi brojeve). Delovi se vraćaju u magacin kao pri pojedinačnom brisanju.
- `POST /api/nalozi/bulk-assign` `{ids, technicianId}` – sve ili ništa; `technicianId: null` uklanja servisera. Završeni i otkazani nalozi se ne mogu dodeliti.
- `POST /api/parts/bulk-active` `{ids, active}` – aktiviranje / deaktiviranje delova (sve ili ništa).
- `POST /api/customers/bulk-delete` `{ids}` – klijenti koji imaju naloge se preskaču i vraćaju u odgovoru (`skipped`), ostali se brišu.

**Nalozi i magacin:**

| Metoda | Putanja | Ko |
|---|---|---|
| POST | `/api/nalozi` | samo administrator / menadžer |
| PUT | `/api/nalozi/{id}` | administrator; serviser samo svoj nezavršen; nikome za otkazane |
| PATCH | `/api/nalozi/{id}/work-done` | dodeljeni serviser ili administrator (završen: samo administrator) |
| DELETE | `/api/nalozi/{id}` | administrator; ne za završene |
| POST | `/api/nalozi/preview` | svi – provera zaliha bez čuvanja (`nalogId` = izmena) |
| GET | `/api/nalozi`, `/{id}`, `/{id}/history` | svi (po pravilu pristupa) |
| PATCH | `/api/nalozi/{id}/status` | po pravilu pristupa (otkazivanje: administrator; završavanje: vidi **Zatvaranje naloga**) |
| PATCH | `/api/nalozi/{id}/assign`, `/{id}/schedule` | admin |
| GET/POST/DELETE | `/api/nalozi/{id}/photos[/{photoId}/file]` | po pravilu pristupa |
| GET/POST/DELETE | `/api/nalozi/{id}/notes[/{noteId}]` | čitanje/dodavanje po pravilu pristupa, brisanje admin; na završenom nalogu samo čitanje (409) |
| GET | `/api/nalozi/customers`, `/technicians`, `/stats`, `/calendar` | po pravilu pristupa / admin |
| GET | `/api/nalozi/reports/summary`, `/reports/export.csv` | admin |
| GET | `/api/parts` | svi čitaju |
| POST/PUT | `/api/parts`, `/api/parts/{id}` | administrator / menadžer |
| POST | `/api/parts/{id}/stock` | svi prijavljeni (korekcija stanja, upisuje se ko je uradio) |
| GET | `/api/parts/{id}/movements` | svi prijavljeni – istorija stanja |
| GET | `/api/carried` (`?technicianId=` samo administrator) | prijavljen – svoja lista zaduženja |
| POST | `/api/carried` | prijavljen (administrator može za drugog servisera); najviše 50 stavki po serviseru |
| PUT, DELETE | `/api/carried/{id}` | vlasnik liste ili administrator |

Šema baze: Flyway migracije `V1`–`V11` u `backend-java/src/main/resources/db/migration/` (V8 izvršeni radovi i kategorija *Radni nalog*, V9 ručna cena, V10 novi statusi i uloga menadžera, V11 zaduživanje).

## Pokretanje lokalno (Windows)

Potrebno: Node.js 22, JDK 17+, Maven, PostgreSQL 16.

**1. PostgreSQL** – napravite korisnika i bazu:
```sql
CREATE USER nalog WITH PASSWORD 'dev';
CREATE DATABASE nalog OWNER nalog;
```
Tabele pravi Flyway sam pri prvom pokretanju Java servisa.

**2. Java servis**
```bat
set NALOG_DB_URL=jdbc:postgresql://localhost:5432/nalog
set NALOG_DB_USER=nalog
set NALOG_DB_PASSWORD=dev
set JWT_SECRET=<nasumično, najmanje 32 znaka>
cd backend-java
mvn spring-boot:run
```
Pri prvom pokretanju, kad niko ne može da se prijavi, servis pravi jednog administratora (`admin@servicehub.local`, ili `NALOG_ADMIN_EMAIL`) i **jednom** ispisuje nasumičnu lozinku u logu (traži se red `FIRST ADMIN`). Prijavite se i odmah je promenite. Push obaveštenja rade samo ako postoji Firebase ključ (`NALOG_FIREBASE_CREDENTIALS`, podrazumevano `/secrets/firebase-service-account.json`); bez njega je push isključen, a sve ostalo radi.

**3. Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Ceo sistem se može podići i Dockerom (`docker compose up -d --build`; **samo prvi put** `ALLOW_NEW_DATABASE=true docker compose up -d --build`, posle toga Postgres odbija da pokrene novu praznu bazu ako folder sa podacima nedostaje, vidi `deploy/DEPLOY.md`). Na Windowsu sa WSL2: Docker Desktop mora imati uključenu WSL integraciju za vašu Ubuntu distribuciju, a korisnik mora biti u grupi `docker`.

Za Android uređaj: računar i telefon u istoj mreži, Windows zaštitni zid mora propuštati port 8081; u aplikaciji se unosi `http://IP:8081`.

## Testovi

Java testovi (`backend-java`, `mvn test`): ograničenje pokušaja prijave, push obaveštenje i **integracioni testovi na pravoj PostgreSQL bazi** (prijava, tokeni, poslednji admin, klijenti i pretraga po adresi, stanje magacina i vraćanje transakcije, istovremeno uzimanje poslednjeg dela, status mašina, uslovi za zatvaranje naloga (Pre + Posle + izvršeni radovi), pristup po ulozi, uloga menadžera, izmena/brisanje, izvršeni radovi, konstatacije, podsetnik, zaduživanje, izveštaji, HTTP statusi).

> Testovi za novije funkcije (statusi, ručna cena, menadžer, zaduživanje, uslovi za zatvaranje, izvršeni radovi) su napisani, ali **još nisu pokrenuti**. Pokrenite `mvn test` pre prvog puštanja u rad.

Integracioni testovi traže PostgreSQL na jedan od dva načina:
- **Lokalna baza (bez Dockera):** napravite posebnu bazu čije ime **završava na `_test`** (testovi brišu sve redove, pa se odbijaju da rade na bilo čemu drugom):
  ```bat
  psql -U postgres -c "CREATE DATABASE nalog_test OWNER nalog;"
  set NALOG_TEST_DB_URL=jdbc:postgresql://localhost:5432/nalog_test
  mvn test
  ```
  Opciono `NALOG_TEST_DB_USER` / `NALOG_TEST_DB_PASSWORD` (podrazumevano `nalog` / `dev`).
- **Docker (Testcontainers):** ako `NALOG_TEST_DB_URL` nije postavljen, test sam podiže `postgres:16`. Docker Desktop mora raditi; sa novijim verzijama Docker Engine-a (29+) stariji Testcontainers prijavljuje „Could not find a valid Docker environment“ – tada koristite lokalnu bazu.

## Uvoz starih poslova

Stari poslovi iz SQLite-a mogu se preneti u nove naloge (samo čitanje stare baze, jedna transakcija, može se ponoviti bez duplikata; skripta je samostalna i ne traži stari server):
```bash
node tools/migrate-sqlite-to-postgres.js --db putanja/do/servicehub.db --out import.sql --labor-rate 2500.00
psql -U nalog -h localhost -d nalog -v ON_ERROR_STOP=1 -f import.sql
```
Poslovi bez klijenta ulaze pod klijenta „Nepoznat klijent“. Stari poslovi dobijaju **probnu** cenu rada i PDV (vidi dole) – proverite ih. `import.sql` sadrži podatke klijenata i ne sme u git. Stare fotografije poslova se ne prenose.

## Prelazak sa starog Node servera

Ako već imate pokrenut sistem sa starim `node` servisom (i naloge korisnika u njemu), lozinke se prenose bez promene:

1. Na **staroj** verziji, dok radi: `bash deploy/migrate-users-from-node.sh` (pravi `users-export.sql`, sadrži hešove lozinki).
2. `bash deploy/backup.sh` pa prelazak na novu verziju: `git pull && docker compose up -d --build` (Java pravi nove tabele i privremenog administratora).
3. `bash deploy/import-users.sh` – uvozi naloge sa istim id-jevima (dodeljeni nalozi ostaju kod istih servisera) i briše privremenog administratora. Prijavite se starim emailom i lozinkom, pa obrišite `users-export.sql`.
4. Stari podaci u `data/node` više ne trebaju; obrišite ih tek kad sve proverite.

Nova instalacija ovo ne traži.

## Bezbednost

- **Nikad ne komitujte tajne.** `.env` i `firebase-service-account.json` ostaju samo na računaru/serveru (vidi `.gitignore`). Firebase ključ se čita iz fajla (`./secrets/firebase-service-account.json`), ne iz `.env`.
- Ako je tajni ključ ikada bio u javnom repozitorijumu, **opozovite ga i napravite novi** – brisanje fajla ne uklanja ga iz istorije.
- `JWT_SECRET`: dug, nasumičan, drugačiji u produkciji nego u razvoju. Promena odjavljuje sve.
- Prijava je ograničena na 8 neuspešnih pokušaja po IP adresi i email-u u 15 minuta (i 40 po IP adresi). Lozinke: najmanje 8 znakova, BCrypt.
- Otkazani nalog ne prima fotografije.
- Docker objavljene portove ubacuje u iptables mimo `ufw`; objavljuje se samo Caddy (80/443). Vidi `deploy/SERVER.md`.

### Sesije i tokeni

- Server pri svakom zahtevu čita korisnika iz baze: deaktivacija, brisanje i promena uloge važe **odmah** (sledeći zahtev dobija 401, a web aplikacija vraća na prijavu).
- **Promena lozinke** (sopstvena ili reset od administratora) i **deaktivacija** poništavaju sve ranije izdate tokene tog korisnika (`app_user.tokens_valid_after`). Pri sopstvenoj promeni lozinke server vraća svež token, pa korisnik ostaje prijavljen na tom uređaju, a svi ostali se odjavljuju. Ponovna aktivacija ne oživljava stare tokene.
- Android aplikacija posle poništavanja tokena prikazuje „Sesija je istekla“ i treba se ponovo prijaviti (odjava i prijava).
- Android izdanje za produkciju: bez nešifrovanog HTTP-a, prava adresa servera umesto razvojne IP adrese.

## Šta još nedostaje

- **Pravi izgled radnog naloga i reversa za štampu** (sada je probni) i **podaci firme** (PIB, MB, telefon, račun) u `frontend/src/print/company.ts`.
- **Bluetooth A4 štampa sa telefona** (prenosivi štampači koje serviseri nose): radi se poslednja, kad se zna model štampača. Uključuje štampu naloga/reversa sa telefona, dve kopije odjednom.
- **Pravilo o garanciji** (sakrivanje cena na garantnom nalogu) nije potrebno za sada; postoji samo tekst garancije firme na štampi.
- **Uvoz iz stare PHP baze:** čeka strukturu baze ili uzorak podataka.
- **Nije provereno u radu:** Java i testovi za nove funkcije nisu pokrenuti (vidi **Testovi**). Docker build prolazi, ali **pun restore i prelazak sa Node servera još nisu isprobani na pravom serveru**.
- **Pre puštanja u rad** (lista u `deploy/DEPLOY.md` i `deploy/SERVER.md`): nove tajne, Firebase ključ u `./secrets`, backup tajmer i stvarna provera restore-a, UPS, spoljni nadzor, potpisan Android APK sa stalnim ključem.
- Moguće kasnije: istorija opreme po serijskom broju, dodatni izveštaji (prosečna vrednost naloga, najčešće popravljani uređaji), pretraga po datumu. Rezervacija delova, particionisanje baze i slično nisu potrebni za ovu veličinu firme.

## Gubitak pristupa administratoru

Lozinka prvog administratora se ispisuje samo jednom u logu (`docker compose logs java | grep -A3 "FIRST ADMIN"`). Ako je nema, lozinka se menja direktno u bazi:
```bash
HASH=$(docker run --rm httpd:2.4 htpasswd -nbBC 10 x 'NovaLozinka123' | cut -d: -f2)
docker compose exec -T postgres psql -U elgor -d elgor_nalog \
  -c "UPDATE app_user SET password_hash = '$HASH', active = true, tokens_valid_after = extract(epoch from now())::bigint WHERE role = 'admin' RETURNING id, email, active;"
```
Poruka „Too many failed attempts“ je ograničenje prijave (u memoriji): `docker compose restart java` ga briše. Posle prijave odmah promenite lozinku.

## Napomene o razvoju

- Srpski prevodi su pisani bez provere izvornog govornika; svi stringovi su u `frontend/src/i18n/translations.js`.
- Novac u interfejsu: samo prikaz (`print/formatMoney.ts` radi sa stringovima, bez pretvaranja u broj).
- Datumi: Java čuva trenutke u UTC-u; nedelja i meseci u izveštajima računaju se po vremenu Europe/Belgrade.
- Evidencija radnog vremena po smenama nije planirana (sati se vode po nalogu).
