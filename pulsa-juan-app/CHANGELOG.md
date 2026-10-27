# Changelog — Pulsa Juan (Android)

Satu bagian per rilis, terbaru di atas. Judul: `## <version> (versionCode <n>) — <YYYY-MM-DD>`;
isi berupa poin `- ` yang ditampilkan di landing page (Riwayat versi), jadi tulis untuk agen.
Sebelum rilis: naikkan `expo.version` dan `expo.android.versionCode` di `app.json`, tambah bagian
baru di sini, commit, lalu `npm run release:android`.

## 1.0.2 (versionCode 3) — 2026-10-27
- Daftar dan masuk dengan akun Google
- Daftar tanpa kode OTP: cukup isi nomor HP dan data diri, akun langsung aktif
- Tetap masuk selama 1 tahun tanpa perlu login ulang

## 1.0.1 (versionCode 2) — 2026-10-25
- Bayar tagihan PLN Pascabayar dan Telkom / IndiHome: cek tagihan langsung dari aplikasi, lalu bayar dengan saldo
- Cek tagihan menunggu otomatis bila data tagihan masih diproses, dan memberi tahu bila tagihan sudah lunas
- Bukti pembayaran tagihan menampilkan No. Referensi

## 1.0.0 (versionCode 1) — 2026-10-24
- Rilis pertama aplikasi agen Pulsa Juan
- Daftar dengan nomor HP + kode OTP, masuk dengan PIN 6 angka (lupa PIN bisa reset via OTP)
- Isi saldo lewat transfer BRI/BCA dengan kode unik — kode unik ikut masuk ke saldo
- Isi pulsa, paket data, token PLN, e-wallet dan voucher game dengan status transaksi real-time
- Riwayat Saldo: semua saldo masuk & keluar beserta saldo akhirnya
- Program mitra: kode referral dan komisi 2 tingkat
