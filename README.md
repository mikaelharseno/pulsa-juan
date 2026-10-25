# pulsa-juan

Platform agen PPOB (pulsa, paket data, token PLN, e-wallet, game, tagihan): agen membayar dengan **saldo** prabayar yang diisi lewat transfer manual BRI/BCA.

| Paket | Isi | Port |
|---|---|---|
| `pulsa-juan-common` | Tipe + validator + walker `segmentDisplayTree`, deteksi operator, kode unik, format Rp, seed alur | — |
| `pulsa-juan-backend` | Express + Prisma + Postgres (API agen & admin) | 3030 |
| `pulsa-juan-app` | Expo 54 / expo-router — aplikasi agen (Android + web) | 8081 |
| `pulsa-juan-dashboard` | Vite + React 18 + MUI — dashboard admin (Cloudflare Worker, static assets) | 3031 |
| `pulsa-juan-landing` | Landing page statis (`public/index.html`) — download APK + WhatsApp (Cloudflare Worker, static assets) | 3032 |

## Setup

```bash
nvm use 20
npm install                      # workspace root
cp pulsa-juan-backend/.env.example pulsa-juan-backend/.env   # sesuaikan DATABASE_URL, TOKEN_SECRET, ADMIN_*
npm run build:common
cd pulsa-juan-backend && npx prisma migrate dev && npx prisma db seed && cd ..
```

Seed membuat admin OWNER (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, default `admin@pulsajuan.local` / `admin123`), konfigurasi toko, prefix operator, paket contoh dan 8 segmen contoh (Pulsa, XL, Telkomsel, Paket Data, Token PLN, PLN Pascabayar (nonaktif), Gopay, Mobile Legends).

## Menjalankan

```bash
npm run dev:backend      # ts-node + nodemon (build common dulu)
npm run dev:dashboard    # http://localhost:3031
npm run dev:app          # expo web http://localhost:8081 — `npm run android -w pulsa-juan-app` untuk emulator
npm run dev:landing      # http://localhost:3032
```

OTP belum terhubung ke gateway WhatsApp/SMS: kode hanya dicetak di log backend (`[otp] …`). Dengan `OTP_DEBUG=1` (default di `.env` lokal) kode juga dikembalikan oleh API dan ditampilkan di layar OTP aplikasi. **Jangan aktifkan di production.**

## Deploy dashboard & landing (Cloudflare Workers, static assets)

Sama dengan invoice-bellin-frontend: masing-masing Worker hanya menyajikan file statis (`wrangler.jsonc` di tiap paket). Dashboard memakai `not_found_handling: "single-page-application"` agar deep link (`/agents/:id`) jatuh ke `index.html`.

```bash
npx wrangler login
cp pulsa-juan-dashboard/.env.example pulsa-juan-dashboard/.env.production   # isi VITE_API_BASE=https://pulsajuan.studiosclo.uk/api
npm run deploy -w pulsa-juan-dashboard     # vite build + wrangler deploy (dist/)
npm run deploy -w pulsa-juan-landing       # wrangler deploy (public/)
```

Domain kustom: buka komentar `routes` (`custom_domain: true`) di `wrangler.jsonc` — wrangler membuat DNS record + sertifikat. Link APK & nomor WhatsApp landing diatur di konstanta `APK_URL` / `WHATSAPP_NUMBER` di bagian bawah `pulsa-juan-landing/public/index.html`; APK di-hosting di R2 atau memakai URL artifact EAS (bukan di aset Worker).

## Product Updater, OtomaX & notifikasi Telegram

**Product Updater** (dashboard → Katalog → Product Updater): unggah daftar harga OtomaX `.xlsx` — satu sheet per operator (nama sheet INDOSAT/IM3, 3ID/TRI, XL, AXIS, TSEL, SMARTFREN dikenali otomatis), kolom `KODE PRODUK | NAMA | KATEGORI | KET | harga` (harga = **modal**). Harga agen = `bulatkan_ke_atas(modal + Rp tetap + modal × %, Rp n)`; harga yang diubah manual (di pratinjau atau di halaman Paket) dikunci dan tidak ikut margin berikutnya. Pratinjau menunjukkan baru / harga berubah / detail berubah / diaktifkan lagi / dinonaktifkan (kode yang hilang dari file disembunyikan, tidak dihapus). Paket hasil updater bertanda `supplierName = OtomaX`, `code = supplierSku = KODE PRODUK`, kategori `<OPERATOR>_<KATEGORI>`. Setelah diterapkan, tile aplikasi **Paket <Operator>** (nomor HP → kategori → paket) dibuat/dipublikasikan ulang otomatis bila kategorinya berubah — tanpa rilis aplikasi baru.

**OtomaX** (pusat sendiri; pulsa-juan = reseller H2H): isi `OTOMAX_URL`, `OTOMAX_MEMBER_ID`, `OTOMAX_PIN`, `OTOMAX_PASSWORD` (+ `OTOMAX_AUTH`, `OTOMAX_REPORT_KEY`, opsional `OTOMAX_REPORT_IPS`) di `.env` server. Paket yang punya *Kode produk OtomaX* lalu dikirim otomatis: `GET {OTOMAX_URL}/trx?product&qty=1&dest&refID=<no. order>&memberID&sign`. Balasan/report dibaca dengan pola yang bisa diatur (`OTOMAX_SUCCESS_RE`, `OTOMAX_FAIL_RE`, `OTOMAX_SN_RE`); GAGAL = saldo agen direfund otomatis. Di OtomaX, set URL report reseller ke `https://<api>/api/fulfillment/otomax/report?key=<OTOMAX_REPORT_KEY>` (lihat kartu **Integrasi** di Pengaturan) dan whitelist IP droplet. Paket tanpa kode, atau bila OtomaX belum diatur, tetap manual. Uji lokal: `node pulsa-juan-backend/scripts/fake-otomax.mjs`.

**Tagihan pascabayar** (dashboard → Katalog → Tagihan (Biller)): satu biller per jenis tagihan (`PLN_POSTPAID`, `TELKOM`, …; kunci ini dipilih di node *Cek tagihan*). Isi *kode cek* dan *kode bayar* OtomaX, *biaya kita* (ditambah ke admin supplier) dan, bila perlu, pola regex balasan (kosong = pola bawaan untuk format `a/n … Tag Rp … Admin Rp … Total Rp …`; kotak **Tes pola** menguji balasan yang ditempel, **Cek nyata** mengirim cek sungguhan tanpa membuat order). Alur: aplikasi mengirim `POST /agent/inquiries` → OtomaX `product=<kode cek>&dest=<ID pelanggan>&refID=C<no. cek>`; tagihan dari balasan langsung atau dari report (aplikasi polling tiap 2 detik, maks. ±45 detik). Hasil cek berlaku `validityMinutes`; pembayaran memakai tagihan yang tersimpan (total = tagihan + admin supplier + biaya kita + markup referral), cek ditandai terpakai bersamaan dengan potong saldo, lalu `product=<kode bayar>` dikirim dengan refID = no. order; SN di report = **No. Referensi**. Biller baru nonaktif sampai kedua kode diisi; tile *PLN Pascabayar* dan *Telkom / IndiHome* tetap disembunyikan sampai diaktifkan di Segmen. Pusat palsu lokal mendukung `CEK*`/`BYR*` (`BILL_MODE=sync|async`; ID berakhiran 0 = lunas, 9 = tidak terdaftar).

**Telegram**: buat bot di @BotFather, masukkan ke grup admin, isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_IDS` (id grup `-100…`), `DASHBOARD_URL`. Notifikasi: top up diklaim, order manual baru, order gagal di OtomaX, OtomaX tidak terjangkau, order masih diproses > `ALERT_PENDING_MINUTES` (default 10). Tombol *Kirim pesan tes* ada di Pengaturan → Integrasi.

### Harga pasar (produk operator lain dari daftar harga publik)

Untuk operator yang belum ada di OtomaX (XL, Axis, Telkomsel/by.U, Smartfren), daftar produk + harga referensi bisa diambil dari halaman harga **publik** penjual pulsa lain (konfigurasi di `pulsa-juan-backend/scripts/market-prices/sources.json`; hanya halaman publik, tanpa login, ±1 request/detik, robots.txt dicek):

```bash
cd pulsa-juan-backend && node scripts/market-prices/collect.mjs --out ~/Downloads/harga-pasar.xlsx   # ±10 menit
```

Hasilnya xlsx format Product Updater (sheet per operator; `harga` = harga reseller termurah yang ditemukan, kolom per sumber + stok) plus sheet RINGKASAN dan SEMUA SUMBER. Unggah di Product Updater dengan **Kode referensi pasar** (otomatis terpilih untuk file ini): produk disimpan sebagai `PSR-<kode>` (`supplierName = Pasar`), **diproses manual**, dan tidak pernah menonaktifkan produk OtomaX (begitu pula sebaliknya). Isi *Kode produk OtomaX* di halaman Paket untuk memindahkan satu produk ke proses otomatis — kode itu dipertahankan di upload pasar berikutnya. Grup yang tidak bisa dijual lewat aplikasi (perdana, bulk, aktivasi/cetak voucher) dikecualikan lewat `excludeGroups`. Product Updater juga menerima **.csv** (mis. ekspor dari aplikasi agen lain; kolom `OPERATOR` opsional untuk banyak operator dalam satu file). Lebih dari 50 kategori per operator otomatis dibagi ke beberapa halaman di aplikasi.

## Rilis aplikasi Android (versi + riwayat perubahan)

1. Naikkan `expo.version` **dan** `expo.android.versionCode` (+1) di `pulsa-juan-app/app.json`.
2. Tambah bagian `## <version> (versionCode <n>) — <tanggal>` berisi poin `- ` di `pulsa-juan-app/CHANGELOG.md` (ditampilkan ke agen di landing).
3. Commit, lalu (Node ≥ 22, sudah `eas login` + `wrangler login`):

```bash
npm run release:android -w pulsa-juan-app      # build EAS (profil release-apk) → R2 → releases.json → tag → deploy landing
git add pulsa-juan-landing/public/releases.json && git commit -m "Release Android <version>"
git push origin main --follow-tags
```

Hasilnya: `pulsa-juan-<version>.apk` (disimpan permanen) + `pulsa-juan.apk` (terbaru) di bucket R2 privat `pulsa-juan-downloads`, disajikan landing di `/download/...`; `pulsa-juan-landing/public/releases.json` mencatat tanggal, ukuran, sha256, commit dan ID build EAS; tag git `android-v<version>`. Landing menampilkan versi terbaru di bawah tombol Download dan bagian "Riwayat versi". Aplikasi menampilkan versinya di bawah tombol Keluar (Profil). Build yang sudah jadi bisa dipublikasikan ulang dengan `-- --build-id <id>`.

Profil lain: `preview` = APK demo (data mock), `production` = AAB untuk Play Store.

## Konsep utama

- **segmentDisplayTree**: setiap ikon beranda (Segment) punya alur berupa peta datar `{ rootId, nodes }` dengan node `ListNode`, `PackagesList`, `PhoneNumberInput`, `EnterAmount`, `CustomerIdInput`, `BillInquiry`. Walker yang sama (`walkPath`/`computeTotal`/`describeSteps` di common) dipakai aplikasi, backend (validasi ulang harga sebelum saldo dipotong) dan dashboard (validasi + pratinjau). Draf disimpan di `Segment.draftTree`; publikasi membuat `SegmentTreeVersion` yang tidak bisa diubah.
- **Akun agen**: daftar = nomor HP + OTP → nama, NIK (opsional), PIN 6 angka (+ email/password opsional). Masuk dengan HP + PIN (terkunci 15 menit setelah 5x salah, reset via OTP) atau email/password atau Google (akun Google baru wajib verifikasi HP). OTP disimpan sebagai hash di `Agent.confirmationCode*` (reset PIN) atau `PhoneVerification` (nomor belum terdaftar).
- **Top up**: `TopUpOrder` dengan kode unik 3 digit = `orderNumber % 1000` (0–999, maju jika bentrok dengan top up terbuka); saldo yang masuk = **nominal + kode unik**. Agen menekan "Saya Sudah Bayar" → CLAIMED + link wa.me ke CS. Admin mengonfirmasi **wajib** dengan screenshot mutasi bank (JPG/PNG); OWNER boleh konfirmasi kredit (menambah `Agent.hutang`).
- **Referral 2 tingkat**: `Agent.commisionUniqueId` ("crown", bisa dipindah OWNER), `Agent.referrerAgentId` + `Agent.referrerMarkup` (markup dibekukan saat mitra mendaftar), `AgentMarkupCommision` per transaksi untuk pengundang + pengundang tingkat 2; agen mengklaim komisi → saldo & `saldoKomisi` bertambah.
- **Order isi pulsa (`Transaction`)**: PENDING → SUCCESS / FAILED (gagal = refund otomatis), dan SUCCESS → REFUNDED (refund manual oleh admin; komisi yang sudah diklaim ditarik dari saldo pengundang, kekurangan jadi hutang). Fulfilment v1 manual; `FulfillmentProvider` di `pulsa-juan-backend/src/service/fulfillment` (`FULFILLMENT_PROVIDER=manual|otomax`, Otomax masih stub) dan callback supplier `POST /api/fulfillment/callback/:provider` (header `X-Callback-Secret`).

## Google Sign-In

Isi `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` di backend `.env` dan `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (atau `expo.extra` di `app.json`) di aplikasi. Tombol Google baru tampil bila client id terisi. Android client id butuh SHA-1 keystore aplikasi.

## Deploy backend

Pola sama dengan terbebas-backend: `npm run build` (tsc + salin Prisma client ke `dist/`), `npm run start:prod`, migrasi lewat `npm run migrate:prod` dari mesin dev. Lihat `pulsa-juan-backend/deploy.sh`.
