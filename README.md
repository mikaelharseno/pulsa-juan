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
