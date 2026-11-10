import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { formatRp } from 'pulsa-juan-common';

import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { getConfig } from './config.service';

// The customer's bon (receipt) for one order, as a PDF behind an unguessable
// public link so it can be sent over WhatsApp. It shows what the customer pays
// (the agent's sell price) and never the agent's own cost.

const TOKEN_BYTES = 18;

function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Returns the order's bon token, making one on first use. */
export async function bonTokenFor(agentId: string, transactionId: string) {
  const trx = await prisma.transaction.findFirst({ where: { id: transactionId, agentId }, select: { id: true, status: true, invoiceToken: true } });
  if (!trx) throw notFound('Transaksi tidak ditemukan');
  if (trx.status === 'FAILED' || trx.status === 'REFUNDED') throw badRequest('Transaksi gagal / direfund tidak punya bon');
  if (trx.invoiceToken) return { token: trx.invoiceToken };
  const token = newToken();
  // a concurrent first call may have set one; keep whichever landed
  await prisma.transaction.updateMany({ where: { id: trx.id, invoiceToken: null }, data: { invoiceToken: token } });
  const fresh = await prisma.transaction.findUniqueOrThrow({ where: { id: trx.id }, select: { invoiceToken: true } });
  return { token: fresh.invoiceToken! };
}

/** Asia/Jakarta (UTC+7) date and time, e.g. "10/11/2026 14:05 WIB". */
export function wibDateTime(d: Date) {
  const w = new Date(d.getTime() + 7 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(w.getUTCDate())}/${pad(w.getUTCMonth() + 1)}/${w.getUTCFullYear()} ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())} WIB`;
}

const STATUS_LABEL: Record<string, string> = { SUCCESS: 'Sukses', PENDING: 'Diproses' };

export interface BonData {
  sellerName: string;
  sellerPhone: string;
  trxNumber: number;
  createdAt: Date;
  status: string;
  segmentLabel: string;
  rows: { label: string; value: string }[];
  serial: { label: string; value: string } | null;
  price: number;
  appName: string;
}

export async function bonData(token: string): Promise<BonData> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('Bon tidak ditemukan');
  const t = await prisma.transaction.findUnique({ where: { invoiceToken: token }, include: { agent: { select: { name: true, phone: true } } } });
  if (!t || t.status === 'FAILED' || t.status === 'REFUNDED') throw notFound('Bon tidak ditemukan');
  const config = await getConfig();
  const steps = (t.steps ?? []) as { type?: string }[];
  const rows = ((t.summary ?? []) as { label: string; value: string }[]).filter((r) => r && r.label && r.value);
  return {
    sellerName: t.agent.name,
    sellerPhone: t.agent.phone,
    trxNumber: t.trxNumber,
    createdAt: t.createdAt,
    status: STATUS_LABEL[t.status] ?? t.status,
    segmentLabel: t.segmentLabel,
    rows,
    serial: t.serialNumber ? { label: steps.some((s) => s.type === 'BillInquiry') ? 'No. Referensi' : 'SN / Token', value: t.serialNumber } : null,
    price: t.sellPrice ?? t.total,
    appName: config.appName || 'Murah Kuota',
  };
}

/** A6 receipt: seller, order, product rows, SN and the price the customer pays. */
export function renderBonPdf(b: BonData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 24, info: { Title: `Bon #${b.trxNumber}`, Author: b.sellerName, Creator: b.appName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const teal = '#0F766E';
    const muted = '#6B7280';
    const ink = '#111827';

    doc.fillColor(teal).font('Helvetica-Bold').fontSize(14).text(b.sellerName, left, 24, { width });
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(b.sellerPhone, { width });
    doc.moveDown(0.6);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('BON TRANSAKSI', { width });
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(`#${b.trxNumber}  ·  ${wibDateTime(b.createdAt)}  ·  ${b.status}`, { width });
    doc.moveDown(0.5);

    const line = () => {
      const y = doc.y + 2;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#D1D5DB').stroke();
      doc.y = y + 6;
    };
    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica').fontSize(8.5).text(label, left, y, { width: width * 0.42 });
      const yLabel = doc.y;
      doc.fillColor(ink).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 8.5).text(value, left + width * 0.42, y, { width: width * 0.58, align: 'right' });
      doc.y = Math.max(yLabel, doc.y) + 3;
    };

    line();
    row('Layanan', b.segmentLabel);
    for (const r of b.rows) row(r.label, r.value);
    if (b.serial) row(b.serial.label, b.serial.value);
    line();
    row('Total bayar', formatRp(b.price), true);
    line();
    doc.moveDown(0.4);
    doc.fillColor(muted).font('Helvetica').fontSize(7).text(`Terima kasih. Dibuat dengan ${b.appName}.`, left, doc.y, { width, align: 'center' });
    doc.end();
  });
}
