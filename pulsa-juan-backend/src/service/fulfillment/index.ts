import { InquiryResult } from 'pulsa-juan-common';

import { badRequest } from '../../lib/errors';

// v1: manual fulfilment. Purchases stay PENDING until an admin marks them
// SUKSES/GAGAL in the dashboard. FULFILLMENT_PROVIDER=otomax switches to the
// Otomax H2H provider once it is implemented; its async results arrive on
// POST /api/fulfillment/callback/otomax.

export type PurchaseOutcome =
  | { status: 'PENDING'; supplierRef?: string }
  | { status: 'SUCCESS'; serialNumber?: string; supplierRef?: string }
  | { status: 'FAILED'; reason: string; supplierRef?: string };

export interface FulfillmentProvider {
  /** stored on Transaction.provider */
  readonly name: string;
  readonly mode: 'MANUAL' | 'AUTO';
  inquire(product: string, customerId: string): Promise<InquiryResult>;
  purchase(trx: { id: string; packageId: string | null; customerId: string | null; phoneNumber: string | null; total: number }): Promise<PurchaseOutcome>;
}

export class ManualProvider implements FulfillmentProvider {
  readonly name: string = 'manual';
  readonly mode: 'MANUAL' | 'AUTO' = 'MANUAL';

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

/**
 * Otomax H2H (stub). TODO once the Otomax centre details are known:
 * - purchase: GET/POST to OTOMAX_URL with memberid/pin/password, product code
 *   (Package.supplierSku), destination and our ref id (Transaction.id), then map
 *   the immediate reply to PENDING/SUCCESS/FAILED.
 * - callback: parse Otomax's report format in the fulfillment controller.
 * Until then it behaves like manual (orders wait for an admin).
 */
export class OtomaxProvider extends ManualProvider {
  readonly name: string = 'otomax';
}

function fromEnv(): FulfillmentProvider {
  return process.env.FULFILLMENT_PROVIDER === 'otomax' ? new OtomaxProvider() : new ManualProvider();
}

let provider: FulfillmentProvider = fromEnv();

export function getFulfillmentProvider(): FulfillmentProvider {
  return provider;
}

export function setFulfillmentProvider(p: FulfillmentProvider) {
  provider = p;
}
