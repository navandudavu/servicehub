# ServiceHub — v3

Alat za praćenje poslova/mušterija/uređaja za servisnu firmu. Web kontrolna tabla + API, dvojezičan (engleski/srpski), sa otpremanjem fotografija, zakazivanjem preko kalendara, kontrolnom tablom sa statistikom, praćenjem radnih sati, CSV izvozom i potpunim upravljanjem evidencijom.

## Šta zapravo radi

- Prijavljivanje sa ulogama: `admin` i `technician`
- Prebacivanje jezika (EN/SR) — čuva se za svaki pregledač, može se promeniti sa ekrana za prijavu ili iz bočne trake u bilo kom trenutku
- Administratori: kreiraju poslove, upravljaju mušterijama/uređajima, dodeljuju tehničare, upravljaju timom, vide sve poslove, resetuju bilo čiju lozinku, brišu mušterije/članove tima (uz bezbednosne provere — pogledajte ispod), izvoze CSV
- Tehničari: vide poslove koji su im dodeljeni, pomeraju ih kroz statuse
  pending → assigned → in_progress → finished, dodaju beleške, otpremaju fotografije,
  evidentiraju odrađene sate, menjaju sopstvenu lozinku
- Svaka promena statusa se evidentira zajedno sa informacijom ko ju je promenio i kada
- Tabla poslova je kanban prikaz po statusima, sa prikazom evidentiranih sati za svaki posao
- Kalendar: nedeljni prikaz zakazanih poslova, klik vodi direktno na posao
- Kontrolna tabla: broj otvorenih/nedodeljenih/hitnih poslova, završeni ove nedelje, poslovi po tehničaru, evidentirani sati po tehničaru (ukupno + poslednjih 7 dana), CSV izvoz svih podataka o poslovima jednim klikom
- Otpremanje fotografija uz poslove (maks. 8 MB, JPEG/PNG/WEBP/HEIC), sa lightbox prikazom u punoj veličini, mogućnost brisanja od strane osobe koja je fotografiju otpremila ili administratora (uz potvrdu)
- Praćenje sati po poslu — dodeljeni tehničar ili administrator evidentira decimalni broj sati (npr. 2.5) za svaki posao; ukupni sati se sabiraju na kontrolnoj tabli i u CSV izvozu
- Brisanje mušterija i članova tima — ali samo kada je bezbedno. Pogledajte ispod.

## Pravila bezbednog brisanja

Trajno brisanje je dozvoljeno samo kada ne može neprimetno da uništi istoriju:

- **Mušterije**: brisanje je blokirano ako imaju bilo kakve poslove u evidenciji (njihovo brisanje bi kaskadno obrisalo celu istoriju tih poslova — pogledajte šemu). Prvo obrišite njihove poslove ako ste sigurni, ili jednostavno ostavite evidenciju mušterije kakva jeste.
- **Članovi tima**: brisanje je blokirano ako imaju bilo kakvu istoriju poslova (dodeljene poslove, beleške ili fotografije). Ne možete obrisati sebe i ne možete obrisati poslednjeg aktivnog administratora. Umesto toga koristite Deaktiviraj za svakoga ko ima istoriju — tako evidencija ostaje netaknuta, dok se uklanja njihova mogućnost prijavljivanja.

Svako od ovih pravila se primenjuje na serverskoj strani, a ne samo skrivanjem u korisničkom interfejsu, i sva su testirana na pokrenutom API-ju, uključujući granične slučajeve (brisanje samog sebe, poslednji administrator, pogrešne dozvole).

## Tehnološki stack

- Backend: Node + Express + SQLite (preko better-sqlite3), JWT autentifikacija, multer za otpremanje fajlova
- Frontend: React + Vite, bez UI frameworka, običan CSS sa dizajnerskim tokenima, mali ručno napravljen i18n sloj (bez spoljne i18n biblioteke — samo rečnik + React context, pogledajte `frontend/src/i18n/`)
- Otpremnjene fotografije se čuvaju na disku u `backend/data/uploads/`, a metapodaci u SQLite-u — ne čuvaju se kao blobovi u bazi podataka
- Nisu potrebni spoljni servisi — SQLite je jedan fajl na disku, nema ničega što treba dodatno podesiti

## Pokretanje lokalno

Potrebno je da imate instaliran Node.js (v18+, ovo je napravljeno i testirano na v22).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # opciono za lokalni razvoj, podrazumevane vrednosti rade
node src/db/seed.js you@example.com yourpassword "Your Name"
node src/server.js
```

Seed skripta kreira vaš prvi administratorski nalog — to je jedini način da dobijete prijavu, pošto nema javne registracije (namerno, ovo je interni alat). Možete je ponovo pokrenuti sa drugačijim argumentima da napravite još administratora ako želite; neće duplirati postojeću email adresu.

Ako prelazite sa starije kopije ovog projekta koja već ima postojeći fajl `backend/data/servicehub.db`, nema problema — backend automatski dodaje sve nove kolone baze podataka koje su mu potrebne prilikom pokretanja (mala provera migracije u `src/db/index.js`), tako da ne morate brisati postojeće podatke. Potvrđeno je da radi sa stvarnom bazom podataka pre nadogradnje tokom razvoja, a ne samo sa potpuno novom.

Backend radi na `http://localhost:4000`.

### 2. Frontend

U drugom terminalu:

```bash
cd frontend
npm install
npm run dev
```

Otvara se na `http://localhost:5173`. Vite razvojni server prosleđuje `/api/*` zahteve backendu na portu 4000 (pogledajte `vite.config.js`), tako da oba moraju biti pokrenuta.

Prijavite se koristeći email/lozinku koje ste prosledili seed skripti.

### 3. Isprobajte

- Prebacite EN/SR sa ekrana za prijavu ili bočne trake — sve se menja osim podataka koje ste sami uneli (imena mušterija, naslovi poslova koje ste ukucali itd. — to su vaši podaci, a ne elementi korisničkog interfejsa, tako da ostaju onako kako ste ih ukucali bez obzira na jezik)
- Kao administrator, idite na Team → dodajte tehničara
- Idite na Customers → dodajte mušteriju → dodajte joj uređaj
- Idite na Job Board → New job → izaberite tu mušteriju, napišite naslov, dodelite tehničara, opciono postavite termin
- Otvorite posao → otpremite fotografiju, dodajte belešku, evidentirajte odrađene sate
- Proverite stranice Dashboard (sati po tehničaru, dugme za CSV izvoz) i Calendar
- Odjavite se, ponovo se prijavite kao tehničar (koristeći lozinku koju ste mu postavili), gledajte kako se posao pojavljuje na njegovoj tabli, provucite ga kroz statuse, sami evidentirajte sate na njemu
- Isprobajte Team → Reset password za tehničara, a zatim posebno kliknite na sopstveno ime u bočnoj traci da promenite sopstvenu lozinku
- Pokušajte da obrišete novu mušteriju/tehničara bez istorije poslova (radi), zatim pokušajte da obrišete nekoga ko ima istoriju poslova (blokirano, uz objašnjenje) — to je bezbednosno pravilo koje radi kako je zamišljeno, a ne greška

## Šta OVDE NIJE uključeno

- Android aplikacija — ovo je samo web. API je spreman za nju (JSON + JWT), ali još ne postoji Kotlin kod.
- Interni chat — koristite WhatsApp/Viber, nemojte ponovo praviti Slack
- Push obaveštenja
- Samouslužno „zaboravljena lozinka“ putem emaila — nema email servera. Administratori direktno resetuju lozinke (stranica Team); vi sami saopštite osobi novu privremenu lozinku.
- Pravo postavljanje na server — ovo trenutno radi samo na localhost-u. Niko osim vas ne može da mu pristupi i prestaje da radi kada je vaš računar ugašen.
- Evidencija smena sa prijavljivanjem/odjavljivanjem — sati se evidentiraju po poslu, a ne kao evidencija radnog vremena. Ako odlučite da zaista želite i praćenje rada po smenama, to je druga funkcionalnost, a ne proširenje ove.

## Poznate grube ivice

- Podrazumevani JWT_SECRET u kodu je rezervisana vrednost. U redu je za lokalni razvoj, ali NIJE u redu ako ovo ikada postavite na pravi server kojem ljudi mogu pristupiti. Postavite pravi u `.env`.
- Nema automatizovanih testova. Sve je provereno ručno stvarnim pokretanjem API-ja od početka do kraja tokom razvoja (uključujući problematične slučajeve — pogrešne lozinke, granice dozvola, loše tipove fajlova, zaštitu poslednjeg administratora, blokiranje brisanja samog sebe) — radi, ali nema zaštitne mreže protiv regresija ako počnete sami da ga menjate.
- SQLite je zaista sasvim dobar za malu porodičnu firmu (jedan fajl, bez administriranja), ali se NEĆE skalirati na veliko istovremeno opterećenje upisivanjem od mnogo korisnika. Pri vašem verovatnom obimu to nije problem.
- Otpremnjene fotografije se čuvaju na disku, nešifrovane, bez skeniranja na viruse, bez promene veličine/kompresije slika — tehničar koji više puta otprema fotografije telefona u punoj rezoluciji popuniće prostor na disku brže nego što biste očekivali pri većem obimu. U redu za mali tim; vredi znati.
- Ovo je provereno kompiliranjem i API je opsežno testiran, uključujući stvarnu Vite proxy putanju koju pregledač koristi, ali nije ručno prođeno od početka do kraja u stvarnom pregledaču od strane čoveka (u okruženju u kojem je ovo napravljeno nije bio dostupan pregledač). Sami prođite kroz aplikaciju, posebno kroz tokove otpremanja fotografija, evidentiranja sati i CSV izvoza, pre nego što joj poverite stvarne podatke.
- Srpski prevodi su funkcionalni, napisala ih je osoba koja je ovo pravila (ja, AI, koji prevodi bez provere izvornog govornika) — dovoljno su dobri za korišćenje, ali ako nešto zvuči nezgrapno stvarnom govorniku srpskog jezika, to je očekivano i vredi popraviti. Svi stringovi se nalaze u jednom fajlu: `frontend/src/i18n/translations.js`.
- Evidentirani sati su običan decimalni broj po poslu, koji se ne proverava u odnosu na bilo šta drugo (npr. neće upozoriti ako neko evidentira 40 sati na jednom poslu). To je namerna jednostavnost, a ne propust — označite ako kasnije želite strožu validaciju.

## Značajne greške na koje se naišlo i koje su popravljene tokom razvoja

Dokumentovano ovde kako biste znali da je kodna baza zaista korišćena i testirana, a ne samo napisana i pretpostavljena kao ispravna:

- SQLite dvostruko navodnike u SQL-u čita kao identifikatore kolona, a ne kao string literale. Dva odvojena upita (`datetime("now")` i `CASE WHEN "urgent" THEN...` sortiranje prioriteta) koristila su dvostruke navodnike i rušila se tokom izvršavanja. Oba su popravljena na jednostruke navodnike i oba su ponovo testirana.
- URL-ovi fotografija zahtevaju JWT auth zaglavlje da bi se učitali (backend ih štiti prijavom), što običan `<img src="...">` tag ne može da pošalje. Napravljena je mala komponenta koja preuzima sliku kao blob sa auth zaglavljem i zatim je pretvara u object URL. CSV izvoz ima isti problem i koristi isto rešenje (preuzimanje kao blob, ručno pokretanje preuzimanja).
- Usred razvoja, automatizovana izmena fajla Team.jsx slučajno je obrisala početnu liniju deklaracije funkcije, ostavljajući izdvojeni kod bez funkcije koja ga obuhvata — odmah je primećeno jer kompajliranje nije uspelo, a ne zato što je izgledalo pogrešno. Popravljeno i ponovo provereno.
- Tokom dodavanja polja za unos evidentiranja sati u prikaz detalja posla, izmena je slučajno obrisala uslov koji je ograničavao dodeljivanje tehničara samo administratorima — to bi omogućilo tehničarima da ponovo dodeljuju poslove sami sebi. Primećeno ručnom proverom logike nakon izmene, a ne kompajliranjem (koje je u svakom slučaju prošlo, jer je uslov bio validan ali pogrešan, a ne sintaksna greška). Popravljeno i ponovo provereno.
- `.btn-secondary` (koji se koristi za većinu dugmadi koja nisu primarna) nije imao sopstveni padding — svaka upotreba širom aplikacije to je nadoknađivala jednokratnim inline paddingom, zbog čega je razmak postao nedosledan. Popravljeno je tako što je klasi data stvarna podrazumevana veličina, a zatim je trebalo osigurati da nove klase modifikatora veličine `.btn-sm`/`.btn-xs` budu deklarisane *posle* nje u stylesheet-u — CSS pravila jednake specifičnosti primenjuju se prema redosledu u fajlu, a ne prema redosledu JSX klasa, tako da bi njihovo deklarisanje pogrešnim redosledom neprimetno učinilo modifikatore veličine beskorisnim. Provereno pregledanjem stvarnog kompajliranog CSS izlaza, a ne samo pretpostavkom da je redosled iz izvornog koda sačuvan tokom kompajliranja.
- Nova komponenta za prazno stanje korišćena je u Customers.jsx bez dodavanja importa — ovo NIJE srušilo kompajliranje (React/JSX bundlovanje ne hvata uvek statički referencu na nedefinisanu komponentu onako kako biste očekivali), tako da bi standardna provera „kompajliranje je prošlo“ ovo propustila. Primećeno je eksplicitnom proverom liste importa u odnosu na sve što se koristi u fajlu. Vredi znati ako ovde budete pisali još koda: uspešno kompajliranje je neophodan, ali ne i dovoljan dokaz da se komponenta zaista pravilno razrešava.

## Ako želite da nastavite sa razvojem

1. Sami prođite kroz aplikaciju, pronađite šta vas nervira, prvo popravite to
2. Postavite je negde gde joj se može pristupiti (mali VPS, Railway, Render — bilo šta što može da pokreće Node i trajno čuva fajl i folder sa otpremljenim fotografijama)
3. Kompresija/promena veličine slika prilikom otpremanja, ako skladištenje fotografija postane problem
4. Tek onda: Android aplikacija, tim redosledom prema uloženom trudu u odnosu na korist