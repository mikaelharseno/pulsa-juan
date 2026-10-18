import { InquiryResult } from 'pulsa-juan-common';

import { badRequest } from '../../lib/errors';

// v1: manual fulfilment. Purchases stay PENDING until an admin marks them
// SUKSES/GAGAL in the dashboard. A Digiflazz/IAK provider slots in here later.

export type PurchaseOutcome = { status: 'PENDING' } | { status: 'SUCCESS'; serialNumber?: string } | { status: 'FAILED'; reason: string };

export interface FulfillmentProvider {
  inquire(product: string, customerId: string): Promise<InquiryResult>;
  purchase(trx: { id: string; packageId: string | null; customerId: string | null; phoneNumber: string | null; total: number }): Promise<PurchaseOutcome>;
}

export class ManualProvider implements FulfillmentProvider {
  async inquire(product: string, customerId: string): Promise<InquiryResult> {
    if (process.env.FULFILLMENT_STUB !== '1') {
      throw badRequest('Cek tagihan belum tersedia. Hubungi CS.', 'INQUIRY_UNAVAILABLE');
    }
    // deterministic fake bill so the flow can be exercised end-to-end
    const digits = customerId.replace(/\D/g, '');
    const seed = digits ? parseInt(digits.slice(-4), 10) : 1234;
    return {
      customerId,
      customerName: `PELANGGAN ${digits.slice(-4) || '0000'}`,
      periode: new Date().toISOString().slice(0, 7),
      amountDue: 50000 + (seed % 50) * 1000,
      adminFee: product === 'PLN_POSTPAID' ? 2500 : 2000,
    };
  }

  async purchase(): Promise<PurchaseOutcome> {
    return { status: 'PENDING' };
  }
}

let provider: FulfillmentProvider = new ManualProvider();

export function getFulfillmentProvider(): FulfillmentProvider {
  return provider;
}

export function setFulfillmentProvider(p: FulfillmentProvider) {
  provider = p;
}
