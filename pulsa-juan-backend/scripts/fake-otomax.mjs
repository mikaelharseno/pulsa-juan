#!/usr/bin/env node
// Local stand-in for an OtomaX center (dev only). Answers /trx like OtomaX
// ("akan diproses"), then calls our report URL with SUKSES + SN a few seconds
// later. Products whose code starts with FAIL get a GAGAL reply instead.
//
//   node scripts/fake-otomax.mjs                # :6969, reports to localhost:3030
//   REPORT_URL=... DELAY_MS=3000 node scripts/fake-otomax.mjs
//
// Backend .env for it: OTOMAX_URL=http://127.0.0.1:6969 OTOMAX_MEMBER_ID=PJDEV
// OTOMAX_PIN=1234 OTOMAX_PASSWORD=dev OTOMAX_REPORT_KEY=dev-report-key
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 6969);
const REPORT_URL = process.env.REPORT_URL ?? 'http://localhost:3030/api/fulfillment/otomax/report?key=dev-report-key';
const DELAY_MS = Number(process.env.DELAY_MS ?? 3000);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname !== '/trx') return res.writeHead(404).end('unknown');
    const q = Object.fromEntries(url.searchParams);
    console.log('trx', q);
    const tag = `R#${q.refID} ${q.product}.${q.dest}`;
    if (q.product?.startsWith('FAIL')) return res.end(`${tag} GAGAL. Produk sedang gangguan`);
    res.end(`${tag} akan diproses @${new Date().toLocaleTimeString('id-ID')}`);
    setTimeout(async () => {
      const sn = String(Date.now()).slice(-12);
      const report = new URL(REPORT_URL);
      report.searchParams.set('refid', q.refID);
      report.searchParams.set('message', `T#${Math.floor(Math.random() * 1e6)} ${tag} SUKSES. SN: ${sn}. Saldo 1.000.000`);
      const r = await fetch(report).catch((e) => ({ status: 'ERR ' + e.message, text: async () => '' }));
      console.log('report', q.refID, r.status, await r.text());
    }, DELAY_MS);
  })
  .listen(PORT, () => console.log(`fake OtomaX on :${PORT} → reports to ${REPORT_URL}`));
