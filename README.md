# pulsa-juan

Platform agen PPOB (pulsa, paket data, token PLN, e-wallet, game, tagihan): agen membayar dengan **saldo** prabayar yang diisi lewat transfer manual BRI/BCA.

| Paket | Isi | Port |
|---|---|---|
| `pulsa-juan-common` | Tipe + validator + walker `segmentDisplayTree`, deteksi operator, kode unik, format Rp, seed alur | — |
| `pulsa-juan-backend` | Express + Prisma + Postgres (API agen & admin) | 3030 |
| `pulsa-juan-app` | Expo 54 / expo-router — aplikasi agen (Android + web) | 8081 |
| `pulsa-juan-dashboard` | Vite + React 18 + MUI — dashboard admin | 3031 |

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
```

Aplikasi membaca `EXPO_PUBLIC_API_BASE` (default `http://localhost:3030/api`; emulator Android otomatis memakai `10.0.2.2`). Dashboard membaca `VITE_API_BASE`.

## Tes

```bash
npm run test:common
npm run test:backend     # butuh Postgres lokal; memakai DB `pulsa_juan_test` (TEST_DATABASE_URL untuk override)
```

## Konsep utama

- **segmentDisplayTree**: setiap ikon beranda (Segment) punya alur berupa peta datar `{ rootId, nodes }` dengan node `ListNode`, `PackagesList`, `PhoneNumberInput`, `EnterAmount`, `CustomerIdInput`, `BillInquiry`. Walker yang sama (`walkPath`/`computeTotal`/`describeSteps` di common) dipakai aplikasi, backend (validasi ulang harga sebelum saldo dipotong) dan dashboard (validasi + pratinjau). Draf disimpan di `Segment.draftTree`; publikasi membuat `SegmentTreeVersion` yang tidak bisa diubah.
- **Top up**: `TopUpOrder` dengan kode unik 3 digit (`amount + kodeUnik`), agen menekan "Saya Sudah Bayar" → CLAIMED + link wa.me ke CS. Admin mengonfirmasi **wajib** dengan screenshot mutasi bank (JPG/PNG); OWNER boleh konfirmasi kredit (menambah `Agent.hutang`).
- **Referral 2 tingkat**: `Agent.commisionUniqueId` ("crown", bisa dipindah OWNER), `MitraConnection` (markup dibekukan saat mitra mendaftar), `AgentMarkupCommision` per transaksi untuk pengundang + pengundang tingkat 2; agen mengklaim komisi → saldo & `saldoKomisi` bertambah.
- **Fulfilment v1 manual**: transaksi PENDING sampai admin menandai Sukses/Gagal (Gagal = refund otomatis). `FulfillmentProvider` di `backend/src/service/fulfillment` siap diganti integrasi supplier.

## Google Sign-In

Isi `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` di backend `.env` dan `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (atau `expo.extra` di `app.json`) di aplikasi. Tombol Google baru tampil bila client id terisi. Android client id butuh SHA-1 keystore aplikasi.

## Deploy backend

Pola sama dengan terbebas-backend: `npm run build` (tsc + salin Prisma client ke `dist/`), `npm run start:prod`, migrasi lewat `npm run migrate:prod` dari mesin dev. Lihat `pulsa-juan-backend/deploy.sh`.
