#!/usr/bin/env node
// Local stand-in for an OtomaX center (dev only). Answers /trx like OtomaX
// ("akan diproses"), then calls our report URL with SUKSES + SN a few seconds
// later. Products whose code starts with FAIL get a GAGAL reply instead.
//
// Bills: CEK* products are bill checks, BYR* products pay them (sample wording
// from pulsa-juan-common SAMPLE_BILL_REPLIES). A customer id ending in 0 has no
// bill ("sudah lunas"), one ending in 9 is unknown. BILL_MODE=sync answers a check
// with the bill right away; async (default) says "akan diproses" and reports it.
//
//   node scripts/fake-otomax.mjs                # :6969, reports to localhost:3030
//   REPORT_URL=... DELAY_MS=3000 BILL_MODE=sync node scripts/fake-otomax.mjs
//
// Backend .env for it: OTOMAX_URL=http://127.0.0.1:6969 OTOMAX_MEMBER_ID=PJDEV
// OTOMAX_PIN=1234 OTOMAX_PASSWORD=dev OTOMAX_REPORT_KEY=dev-report-key
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 6969);
const REPORT_URL = process.env.REPORT_URL ?? 'http://localhost:3030/api/fulfillment/otomax/report?key=dev-report-key';
const DELAY_MS = Number(process.env.DELAY_MS ?? 3000);
const BILL_MODE = process.env.BILL_MODE === 'sync' ? 'sync' : 'async';

const rp = (n) => n.toLocaleString('id-ID');

/** Bill reply for a CEK* product, deterministic per customer id. */
function billReply(product, dest) {
  if (dest.endsWith('0')) return `${product}.${dest} GAGAL. Tagihan sudah lunas / belum ada tagihan`;
  if (dest.endsWith('9')) return `${product}.${dest} GAGAL. ID pelanggan salah / tidak terdaftar`;
  const bill = 50000 + (Number(dest.slice(-4)) % 300) * 1000 + 300;
  const admin = 2500;
  if (product.includes('PLN')) {
    return `${product}.${dest} a/n PELANGGAN ${dest.slice(-4)}, R1/1300VA, 1 Lbr (OKT26), Tag Rp ${rp(bill)}, Admin Rp ${rp(admin)}, Total Rp ${rp(bill + admin)}.`;
  }
  return `${product}.${dest} a/n PELANGGAN ${dest.slice(-4)}; Periode: OKT 2026; Tagihan: Rp ${rp(bill)}; Admin: Rp ${rp(admin)}; Total Bayar: Rp ${rp(bill + admin)}`;
}

async function report(refID, message) {
  const url = new URL(REPORT_URL);
  url.searchParams.set('refid', refID);
  url.searchParams.set('message', message);
  const r = await fetch(url).catch((e) => ({ status: 'ERR ' + e.message, text: async () => '' }));
  console.log('report', refID, r.status, await r.text());
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname !== '/trx') return res.writeHead(404).end('unknown');
    const q = Object.fromEntries(url.searchParams);
    console.log('trx', q);
    const tag = `R#${q.refID} ${q.product}.${q.dest}`;
    if (q.product?.startsWith('FAIL')) return res.end(`${tag} GAGAL. Produk sedang gangguan`);
    const pending = `${tag} akan diproses @${new Date().toLocaleTimeString('id-ID')}`;
    if (q.product?.startsWith('CEK')) {
      const bill = `R#${q.refID} ${billReply(q.product, q.dest ?? '')}`;
      if (BILL_MODE === 'sync') return res.end(bill);
      res.end(pending);
      return setTimeout(() => report(q.refID, bill), Math.min(DELAY_MS, 2000));
    }
    res.end(pending);
    setTimeout(() => {
      const sn = q.product?.startsWith('BYR') ? `0BDS${String(Date.now()).slice(-12)}` : String(Date.now()).slice(-12);
      report(q.refID, `T#${Math.floor(Math.random() * 1e6)} ${tag} SUKSES. SN: ${sn}. Saldo 1.000.000`);
    }, DELAY_MS);
  })
  .listen(PORT, () => console.log(`fake OtomaX on :${PORT} → reports to ${REPORT_URL}`));
