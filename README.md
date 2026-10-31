# ELGOR ServiceHub

Interni alat firme ELGOR (Kruševac) za vođenje servisa bele tehnike i klima uređaja: radni nalozi, klijenti, serviseri, fotografije sa terena, kalendar i izveštaji. Dvojezičan (srpski/engleski), za administratore i servisere.

> Stanje: u razvoju, još nije u produkciji. Pre prave upotrebe pročitajte odeljke **Bezbednost** i **Šta još nedostaje**.

## Od čega se sastoji

| Deo | Tehnologija | Folder | Port (razvoj) |
|---|---|---|---|
| Web aplikacija | React + Vite (JS i TypeScript) | `frontend/` | 5173 |
| Stari API (poslovi, klijenti, tim, prijava) | Node + Express + SQLite | `backend/` | 4000 |
| **Servis za radne naloge** | Java 17 + Spring Boot 3 + PostgreSQL | `backend-java/` | 8081 |
| Uvoz starih poslova u nove naloge | Node skripta | `tools/` | – |
| Android aplikacija za servisere | Kotlin + Jetpack Compose | *nije u ovom repozitorijumu* | – |

Prijava je **jedna**: Node izdaje JWT token, a Java servis ga samo proverava (isti `JWT_SECRET` u oba). Nalozi i novac žive isključivo u Javi/PostgreSQL-u; Node ostaje za prijavu, tim, klijente i stare poslove.

Vite razvojni server prosleđuje `/api/nalozi` i `/api/parts` na Javu (8081), a sve ostalo pod `/api` na Node (4000). U produkciji isto radi reverzni proksi (primer: `Caddyfile` u paketu za postavljanje).

## Radni nalog (nalog)

Svaki nalog beleži: klijenta (ime, adresa, telefon, napomene o lokaciji), uređaj (tip, marka, model, serijski broj), dijagnozu, ugrađene delove iz magacina, sate rada, način plaćanja (gotovina / kartica / virman) i status.

**Statusi:** Nacrt → Dodeljen → U toku ⇄ Čeka delove → Završen. Otkazivanje samo administrator; vraća delove na stanje. Završen i otkazan nalog su konačni.

**Pravila koja server sam sprovodi (ne samo interfejs):**
- **Novac se računa isključivo u Javi** (`BigDecimal`, zaokruživanje `HALF_UP`, 2 decimale); frontend samo šalje količine i prikazuje rezultat, a iznosi putuju kao stringovi (`"7462.92"`), nikad kao decimalni brojevi.
- Svaka izmena podataka je u jednoj transakciji sa potpunim vraćanjem (npr. oduzimanje delova + upis naloga + istorija statusa).
- Dva servisera ne mogu uzeti poslednji deo istovremeno (zaključavanje redova, redosled po id-ju bez zastoja); drugi dobija jasnu grešku 409.
- Ponovljeno slanje istog formulara ne pravi dupli nalog (`Idempotency-Key`).
- Serviser vidi samo naloge dodeljene njemu ili koje je sam napravio; tuđi nalog daje 404.
- Greške su u RFC 7807 obliku, bez internih detalja.

**Fotografije na nalogu:** JPEG/PNG/WebP do 10 MB, vrsta se određuje po stvarnom sadržaju fajla (ne po imenu), čuvaju se na disku pod nasumičnim imenom (`NALOG_PHOTOS_DIR`), vide se samo uz prijavu. Kategorije: pre / posle / nalepnica / ostalo. Brisanje: administrator ili osoba koja je otpremila. Android aplikacija pre slanja smanjuje sliku (najviše 1920 px, JPEG).

**U grani `claude/dashboard-reports-cleanup` (do spajanja sa `master`):**
- Kontrolna tabla i Kalendar čitaju nove naloge; administrator zakazuje planirani dolazak na stranici naloga.
- **Izveštaji** (samo administrator): promet završenih naloga po serviseru / mesecu / načinu plaćanja i CSV izvoz (tačka-zarez, decimalni zarez, otvara se u srpskom Excelu).
- `.gitignore` i uklanjanje tajnih/ličnih fajlova iz praćenja.

## Java API (`/api/nalozi`, `/api/parts`)

| Metoda | Putanja | Ko |
|---|---|---|
| POST | `/api/nalozi` | svi (serviser: automatski dodeljen sebi) |
| POST | `/api/nalozi/preview` | svi – cena bez čuvanja |
| GET | `/api/nalozi`, `/{id}`, `/{id}/history` | svi (po pravilu pristupa) |
| PATCH | `/api/nalozi/{id}/status` | svi (otkazivanje: admin) |
| PATCH | `/api/nalozi/{id}/assign` | admin |
| GET/POST/DELETE | `/api/nalozi/{id}/photos[/{photoId}/file]` | po pravilu pristupa |
| GET | `/api/nalozi/customers`, `/technicians` | svi / admin |
| POST | `/api/nalozi/users/sync` | admin – prenosi tim iz Node-a |
| GET | `/api/parts` (+ izmene) | svi čitaju / admin menja |
| GET | `/api/nalozi/stats`, `/calendar`, PATCH `/{id}/schedule`, GET `/reports/*` | *u grani, vidi iznad* |

## Pokretanje lokalno (Windows)

Potrebno: Node.js 22, JDK 17+, Maven, PostgreSQL 16.

**1. PostgreSQL** – napravite korisnika i bazu:
```sql
CREATE USER nalog WITH PASSWORD 'dev';
CREATE DATABASE nalog OWNER nalog;
```
Tabele pravi Flyway sam pri prvom pokretanju Java servisa.

**2. Node API**
```bash
cd backend
npm install
cp .env.example .env        # postavite JWT_SECRET (min. 32 znaka, nasumično)
node src/db/seed.js you@example.com lozinka "Vaše Ime"   # prvi administrator
node src/server.js
```

**3. Java servis** (isti `JWT_SECRET` kao u Node `.env`):
```bat
set NALOG_DB_URL=jdbc:postgresql://localhost:5432/nalog
set NALOG_DB_USER=nalog
set NALOG_DB_PASSWORD=dev
set JWT_SECRET=<ista vrednost kao u backend\.env>
cd backend-java
mvn test
mvn spring-boot:run
```

**4. Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Za Android uređaj: računar i telefon u istoj mreži, Windows zaštitni zid mora propuštati portove 4000 i 8081; u aplikaciji se unosi adresa Node servera (`http://IP:4000`), a adresa Java servisa se izvodi iz nje (isti računar, port 8081).

## Uvoz starih poslova

Stari poslovi iz SQLite-a mogu se preneti u nove naloge (samo čitanje stare baze, jedna transakcija, može se ponoviti bez duplikata):
```bash
node tools/migrate-sqlite-to-postgres.js --db backend/data/servicehub.db --out import.sql --labor-rate 2500.00
psql -U nalog -h localhost -d nalog -v ON_ERROR_STOP=1 -f import.sql
```
Poslovi bez klijenta ulaze pod klijenta „Nepoznat klijent“. Stari poslovi dobijaju **probnu** cenu rada i PDV (vidi dole) – proverite ih. `import.sql` sadrži podatke klijenata i ne sme u git.

## Bezbednost

- **Nikad ne komitujte tajne.** `.env` i `firebase-service-account.json` ostaju samo na računaru/serveru (vidi `.gitignore` u grani). Ključ za Firebase se čita iz fajla `backend/firebase-service-account.json`, ne iz `.env`.
- Ako je tajni ključ ikada bio u javnom repozitorijumu, **opozovite ga i napravite novi** – brisanje fajla ne uklanja ga iz istorije.
- `JWT_SECRET`: dug, nasumičan, isti u oba servisa, drugačiji u produkciji nego u razvoju.
- Prijava je ograničena na 8 neuspešnih pokušaja po IP adresi i email-u u 15 minuta.
- Otkazani nalog ne prima fotografije; deaktiviran korisnik zadržava važeći token do isteka (12 h).
- Android izdanje za produkciju: bez nešifrovanog HTTP-a, prava adresa servera umesto razvojne IP adrese.

## Šta još nedostaje

- **Pravi izgled radnog naloga za štampu** (sada je probni) i **podaci firme** (PIB, MB, telefon, račun) u `frontend/src/print/company.ts`.
- **Prava cena rada i PDV** – sada probno 2500 RSD/h i 20 % u `backend-java/src/main/resources/application.yml`.
- Stranica za magacin/delove (API postoji, strane još nema); beleške na nalozima; premeštanje starih fotografija poslova u nove naloge.
- Automatski testovi Java servisa (istovremeno uzimanje poslednjeg dela, vraćanje transakcije, ponovljeno slanje, pristup po ulozi). Do sada je proveravano ručno i na pravoj PostgreSQL bazi, a Java kod je kompajliran i testiran samo na računaru vlasnika.
- Postavljanje na server (Docker + Caddy), noćni backup (baza **i** folder sa fotografijama), HTTPS.
- Evidencija radnog vremena po smenama nije uključena (sati se vode po nalogu).

## Napomene o razvoju

- Srpski prevodi su pisani bez provere izvornog govornika; svi stringovi su u `frontend/src/i18n/translations.js`.
- Novac u interfejsu: samo prikaz (`print/formatMoney.ts` radi sa stringovima, bez pretvaranja u broj).
- Datumi: Java čuva trenutke u UTC-u; nedelja i meseci u izveštajima računaju se po vremenu Europe/Belgrade.
- SQLite i Node API ostaju dok se ne odluči da li se Node potpuno gasi.
