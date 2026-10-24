import { InquiryResult } from 'pulsa-juan-common';

import { badRequest } from '../../lib/errors';
import { otomaxConfig, OtomaxProvider } from './otomax';

// Fulfilment is routed per package: a package with an OtomaX product code
// (Package.supplierSku) goes to OtomaX once it is configured (OTOMAX_* env);
// everything else stays PENDING until an admin marks it SUKSES/GAGAL.

export type PurchaseOutcome =
  | { status: 'PENDING'; supplierRef?: string; message?: string }
  | { status: 'SUCCESS'; serialNumber?: string; supplierRef?: string; message?: string }
  | { status: 'FAILED'; reason: string; supplierRef?: string; message?: string };

export interface PurchaseRequest {
  id: string;
  trxNumber: number;
  packageId: string | null;
  /** supplier product code (OtomaX "product") */
  productCode: string | null;
  customerId: string | null;
  phoneNumber: string | null;
  total: number;
}

export interface FulfillmentProvider {
  /** stored on Transaction.provider */
  readonly name: string;
  readonly mode: 'MANUAL' | 'AUTO';
  inquire(product: string, customerId: string): Promise<InquiryResult>;
  purchase(req: PurchaseRequest): Promise<PurchaseOutcome>;
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

const manual = new ManualProvider();
const otomax = new OtomaxProvider();
let override: FulfillmentProvider | null = null;

export function otomaxEnabled() {
  return !!otomaxConfig();
}

/** Provider for a purchase of `pkg` (null = no package, e.g. free amount). */
export function providerFor(pkg: { supplierSku: string | null } | null): FulfillmentProvider {
  if (override) return override;
  return pkg?.supplierSku && otomaxEnabled() ? otomax : manual;
}

/** Bill inquiry stays on the manual/stub provider for now. */
export function getFulfillmentProvider(): FulfillmentProvider {
  return override ?? manual;
}

/** Tests: force one provider for everything (null restores routing). */
export function setFulfillmentProvider(p: FulfillmentProvider | null) {
  override = p;
}
