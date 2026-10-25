import { parseBillMessage, rupiahFromText, SAMPLE_BILL_REPLIES } from '../src/bill';

const defaults = {};

describe('parseBillMessage (default patterns)', () => {
  it('reads a PLN pascabayar bill', () => {
    expect(parseBillMessage(defaults, SAMPLE_BILL_REPLIES.PLN_POSTPAID.ready)).toEqual({
      status: 'READY',
      customerName: 'BUDI SANTOSO',
      periode: '1 Lbr (OKT26)',
      amountDue: 245300,
      supplierAdmin: 2500,
      total: 247800,
    });
  });

  it('reads a Telkom bill', () => {
    expect(parseBillMessage(defaults, SAMPLE_BILL_REPLIES.TELKOM.ready)).toEqual({
      status: 'READY',
      customerName: 'PT CONTOH JAYA ABADI',
      periode: 'OKT 2026',
      amountDue: 356750,
      supplierAdmin: 2500,
      total: 359250,
    });
  });

  it('multi-month PLN bill with admin per sheet', () => {
    const r = parseBillMessage(defaults, 'CEKPLN.532100998877 a/n SITI AMINAH, R1M/900VA, 3 Lbr (AGT26-OKT26), Tag Rp 1.204.650, Admin Rp 7.500, Total Rp 1.212.150');
    expect(r).toMatchObject({ status: 'READY', amountDue: 1204650, supplierAdmin: 7500, total: 1212150, periode: '3 Lbr (AGT26-OKT26)', customerName: 'SITI AMINAH' });
  });

  it('admin fee derived from total when not stated', () => {
    expect(parseBillMessage(defaults, 'a/n ANDI; Tagihan 100.000; Total 102.500')).toMatchObject({ status: 'READY', amountDue: 100000, supplierAdmin: 2500 });
  });

  it('no bill / already paid wins over GAGAL', () => {
    expect(parseBillMessage(defaults, SAMPLE_BILL_REPLIES.PLN_POSTPAID.notPayable).status).toBe('NOT_PAYABLE');
    expect(parseBillMessage(defaults, SAMPLE_BILL_REPLIES.TELKOM.notPayable).status).toBe('NOT_PAYABLE');
  });

  it('failure words → FAILED, "akan diproses" → PENDING', () => {
    expect(parseBillMessage(defaults, 'R#C5 CEKPLN.532100123459 GAGAL. ID pelanggan salah / tidak terdaftar').status).toBe('FAILED');
    expect(parseBillMessage(defaults, SAMPLE_BILL_REPLIES.PLN_POSTPAID.pending)).toEqual({ status: 'PENDING' });
    expect(parseBillMessage(defaults, '')).toEqual({ status: 'PENDING' });
  });

  it('custom patterns override the defaults; broken ones fall back', () => {
    const patterns = { amountRe: String.raw`JML=(\d+)`, adminRe: String.raw`ADM=(\d+)`, nameRe: String.raw`NM=([A-Z ]+?)\|`, notPayableRe: '(' };
    expect(parseBillMessage(patterns, 'OK|NM=JOKO WI|JML=150000|ADM=3000|')).toMatchObject({ status: 'READY', amountDue: 150000, supplierAdmin: 3000, customerName: 'JOKO WI' });
  });

  it('rupiahFromText', () => {
    expect(rupiahFromText('Rp 245.300')).toBe(245300);
    expect(rupiahFromText('245,300')).toBe(245300);
    expect(rupiahFromText('245.300,00')).toBe(245300);
  });
});
