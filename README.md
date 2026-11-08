# ELGOR ServiceHub

Interni alat firme ELGOR (Kruševac) za vođenje servisa bele tehnike i klima uređaja: radni nalozi, magacin delova, klijenti, serviseri, fotografije i beleške sa terena, kalendar i izveštaji. Dvojezičan (srpski/engleski), za administratore i servisere.

> Stanje: u razvoju, još nije u produkciji. Pre prave upotrebe pročitajte odeljke **Bezbednost** i **Šta još nedostaje**.

## Od čega se sastoji

| Deo | Tehnologija | Folder | Port (razvoj) |
|---|---|---|---|
| Web aplikacija | React + Vite (JS i TypeScript) | `frontend/` | 5173 |
| **Server (jedini backend): prijava, tim, klijenti, nalozi, magacin, obaveštenja** | Java 17 + Spring Boot 3 + PostgreSQL | `backend-java/` | 8081 |
| Uvoz starih poslova u nove naloge | Node skripta | `tools/` | – |
| Android aplikacija za servisere | Kotlin + Jetpack Compose | poseban repozitorijum `elgor_technician` | – |

Postoji **jedan backend** (Java). Prijava, nalozi korisnika, tim, klijenti, nalozi, magacin, fotografije i push obaveštenja žive u njemu i u jednoj PostgreSQL bazi. Stari Node/SQLite server je uklonjen (vidi **Prelazak sa starog Node servera**).

Prijava izdaje JWT (HS256, `{id, role, name}`, važi 12 h, potpisan sa `JWT_SECRET`); pri svakom zahtevu server proverava da nalog još postoji, aktivan je, ima istu ulogu i da token nije stariji od poslednje promene lozinke (vidi **Sesije i tokeni**).

Vite razvojni server prosleđuje ceo `/api` na Javu (8081). U produkciji isto radi Caddy (`deploy/Caddyfile`).

## Radni nalog (nalog)

Svaki nalog beleži: klijenta (ime, adresa, telefon, napomene o lokaciji), uređaj (tip, marka, model, serijski broj), dijagnozu, ugrađene delove iz magacina, sate rada, način plaćanja (gotovina / kartica / virman) i status.

**Statusi:** Nacrt → Dodeljen → U toku ⇄ Čeka delove → Završen. Otkazivanje samo administrator; vraća delove na stanje. Završen i otkazan nalog su konačni.

**Pravila koja server sam sprovodi (ne samo interfejs):**
- **Novac se računa isključivo u Javi** (`BigDecimal`, zaokruživanje `HALF_UP`, 2 decimale); frontend samo šalje količine i prikazuje rezultat, a iznosi putuju kao stringovi (`"7462.92"`), nikad kao decimalni brojevi.
- Svaka izmena podataka je u jednoj transakciji sa potpunim vraćanjem (npr. oduzimanje delova + upis naloga + istorija statusa).
- Dva servisera ne mogu uzeti poslednji deo istovremeno (zaključavanje redova, redosled po id-ju bez zastoja); drugi dobija jasnu grešku 409.
- Ponovljeno slanje istog formulara ne pravi dupli nalog (`Idempotency-Key`).
- Serviser vidi samo naloge dodeljene njemu ili koje je sam napravio; tuđi nalog daje 404.
- Greške su u RFC 7807 obliku, bez internih detalja; nedostatak dozvole je uvek 403.

### Izmena i brisanje naloga

Mogu svi nalozi osim **završenih**.

- **Izmena** (dugme *Izmeni* na stranici naloga; administrator bilo koji, serviser samo svoj): klijent, uređaj, dijagnoza, delovi, sati, plaćanje. Status, planirani dolazak i dodela imaju svoja dugmad. Otkazani nalog se ne menja (delovi su mu već vraćeni).
  - U magacinu se pomera samo **razlika** (sa 2 na 5 komada uzima još 3; uklanjanje dela ga vraća), svako pomeranje ide u istoriju dela.
  - Cene: delovi koji su već na nalogu zadržavaju svoju cenu, cena rada i PDV ostaju oni iz trenutka kreiranja; samo novododati deo ide po današnjoj ceni. Prikaz cene u formularu dolazi sa servera i isti je kao pri čuvanju.
  - Ako je neko drugi u međuvremenu izmenio nalog, čuvanje daje 409 („učitajte ponovo“) umesto da pregazi njegov rad.
  - Izmena podataka o klijentu pravi **ispravljeni zapis klijenta samo za taj nalog**; stari nalozi zadržavaju originalne podatke (zato ostaje duplikat u listi klijenata).
- **Brisanje** (dugme *Obriši*, samo administrator, uz potvrdu): delovi se vraćaju na stanje (otkazani nalog ih je već vratio), brišu se fotografije (fajlovi tek nakon uspešnog brisanja), beleške i istorija. Ostaje zapis ko je šta i kada obrisao (`nalog_deleted_log`).
- Ako ponovo pokrenete uvoz starih poslova, obrisani uvezeni nalozi bi se ponovo pojavili.

### Fotografije i beleške

**Fotografije:** JPEG/PNG/WebP do 10 MB, vrsta se određuje po stvarnom sadržaju fajla (ne po imenu), čuvaju se na disku pod nasumičnim imenom (`NALOG_PHOTOS_DIR`), vide se samo uz prijavu. Kategorije: pre / posle / nalepnica / ostalo. Brisanje: administrator ili osoba koja je otpremila. Android aplikacija pre slanja smanjuje sliku (najviše 1920 px, JPEG).

**Automatsko osvežavanje:** stranica naloga (status, istorija, fotografije, beleške) osvežava se sama na 10 s, lista naloga na 20 s, a Pregled na 30 s, samo dok je kartica vidljiva (i odmah kad se vratite na nju). Ne radi se dok traje neka vaša radnja na stranici. Kalendar (prikazana nedelja) na 30 s. Android aplikacija se osvežava dugmetom na listi.

**Beleške:** slobodan tekst (do 2000 znakova, najviše 200 po nalogu) sa autorom i vremenom; vide ih svi koji vide nalog. Ne mogu se menjati (ispravka = nova beleška), briše ih samo administrator. Dozvoljene su i na završenom i otkazanom nalogu jer ne diraju novac.

### Magacin delova (stranica *Delovi*, samo administrator)

Lista sa pretragom i prikazom ukinutih delova, novi deo, izmena (naziv, cena, aktivan), korekcija stanja sa napomenom i **istorija stanja** (ko je, kada i zašto promenio: početno stanje, ručna korekcija, utrošeno na nalogu, nalog otkazan / izmenjen / obrisan). Promena cene važi samo za nove naloge. Ukinut deo se ne može dodati na novi nalog. Serviseri pretražuju delove samo kroz formular naloga.

### Pregled, kalendar, izveštaji

Kontrolna tabla i Kalendar čitaju naloge; administrator zakazuje planirani dolazak na stranici naloga (kalendar: najviše 62 dana odjednom). **Izveštaji** (samo administrator): promet završenih naloga po serviseru / mesecu / načinu plaćanja i CSV izvoz (tačka-zarez, decimalni zarez, otvara se u srpskom Excelu).

## API

**Nalozi korisnika** (iste putanje i oblici kao nekada u Node-u):

| Metoda | Putanja | Ko |
|---|---|---|
| POST | `/api/auth/login` | svi (javno; ograničenje pokušaja) |
| GET | `/api/auth/me` | prijavljen |
| POST | `/api/auth/token` | prijavljen – FCM token telefona |
| GET | `/api/health` | javno |
| GET | `/api/users` | prijavljen |
| POST, DELETE | `/api/users`, `/api/users/{id}` | admin (ne može se obrisati sebe ni poslednji admin) |
| PUT | `/api/users/{id}` | admin ili sam korisnik |
| PATCH | `/api/users/{id}/active`, `/{id}/reset-password` | admin (poslednji aktivan admin se ne može deaktivirati) |
| PATCH | `/api/users/me/password` | prijavljen – vraća svež token |

**Klijenti** (`/api/customers`): GET lista (`?q=`), GET `/{id}` (sa istorijom naloga; serviser vidi samo svoje), POST i PUT (svi), DELETE (admin; 409 ako klijent ima naloge). Postoji **jedna** tabela klijenata, ista kao u formularu naloga.

**Nalozi i magacin:**

| Metoda | Putanja | Ko |
|---|---|---|
| POST | `/api/nalozi` | svi (serviser: automatski dodeljen sebi) |
| PUT | `/api/nalozi/{id}` | admin / vlasnik naloga; ne za završene i otkazane |
| DELETE | `/api/nalozi/{id}` | admin; ne za završene |
| POST | `/api/nalozi/preview` | svi – cena bez čuvanja (`nalogId` = cena pri izmeni) |
| GET | `/api/nalozi`, `/{id}`, `/{id}/history` | svi (po pravilu pristupa) |
| PATCH | `/api/nalozi/{id}/status` | svi (otkazivanje: admin) |
| PATCH | `/api/nalozi/{id}/assign`, `/{id}/schedule` | admin |
| GET/POST/DELETE | `/api/nalozi/{id}/photos[/{photoId}/file]` | po pravilu pristupa |
| GET/POST/DELETE | `/api/nalozi/{id}/notes[/{noteId}]` | čitanje/dodavanje po pravilu pristupa, brisanje admin |
| GET | `/api/nalozi/customers`, `/technicians`, `/stats`, `/calendar` | po pravilu pristupa / admin |
| GET | `/api/nalozi/reports/summary`, `/reports/export.csv` | admin |
| GET | `/api/parts` | svi čitaju |
| POST/PUT | `/api/parts`, `/api/parts/{id}`, `/api/parts/{id}/stock` | admin |
| GET | `/api/parts/{id}/movements` | admin – istorija stanja |

Šema baze: Flyway migracije `V1`–`V7` u `backend-java/src/main/resources/db/migration/`.

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

Za Android uređaj: računar i telefon u istoj mreži, Windows zaštitni zid mora propuštati port 8081; u aplikaciji se unosi `http://IP:8081`.

## Testovi

Java testovi (`backend-java`, `mvn test`): obračun cena, ograničenje pokušaja prijave, push obaveštenje i **integracioni testovi na pravoj PostgreSQL bazi** (prijava, tokeni, poslednji admin, klijenti, stanje magacina i vraćanje transakcije, istovremeno uzimanje poslednjeg dela, status mašina, pristup po ulozi, izmena/brisanje, beleške, izveštaji, HTTP statusi).

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

### Sesije i tokeni

- Server pri svakom zahtevu čita korisnika iz baze: deaktivacija, brisanje i promena uloge važe **odmah** (sledeći zahtev dobija 401, a web aplikacija vraća na prijavu).
- **Promena lozinke** (sopstvena ili reset od administratora) i **deaktivacija** poništavaju sve ranije izdate tokene tog korisnika (`app_user.tokens_valid_after`). Pri sopstvenoj promeni lozinke server vraća svež token, pa korisnik ostaje prijavljen na tom uređaju, a svi ostali se odjavljuju. Ponovna aktivacija ne oživljava stare tokene.
- Android aplikacija posle poništavanja tokena prikazuje „Sesija je istekla“ i treba se ponovo prijaviti (odjava i prijava).
- Android izdanje za produkciju: bez nešifrovanog HTTP-a, prava adresa servera umesto razvojne IP adrese.

## Šta još nedostaje

- **Pravi izgled radnog naloga za štampu** (sada je probni) i **podaci firme** (PIB, MB, telefon, račun) u `frontend/src/print/company.ts`.
- **Prava cena rada i PDV** – sada probno 2500 RSD/h i 20 % u `backend-java/src/main/resources/application.yml`.
- Android aplikacija (repo `elgor_technician`, grana `main`) ima beleške i brisanje naloga, ali ne i izmenu (ona je samo na vebu). Kompajlira se u Android Studiju.
- Postavljanje na server: skripte i uputstvo su u `deploy/` (`DEPLOY.md`: Docker + Caddy, HTTPS ili Cloudflare Tunnel, noćni backup baze **i** fotografija, restore, UPS/NUT). Docker build prolazi, ali **pun restore i prelazak sa Node servera još nisu isprobani na pravom serveru**, pa ih treba proveriti ručno.
- Moguće kasnije: istorija opreme po serijskom broju, dodatni izveštaji (prosečna vrednost naloga, najčešće popravljani uređaji), pretraga po datumu i klijentu. Rezervacija delova, particionisanje baze i slično nisu potrebni za ovu veličinu firme.

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
