import { Injectable, Logger } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { ACCOUNTS } from './data/standard-coa';

/**
 * Turns clinical/operational events into balanced journal entries — the bridge
 * that makes "every transaction is coded automatically" real.
 *
 * Every method is best-effort: if a facility hasn't set up its chart of
 * accounts yet, posting is skipped silently, and any posting failure is logged
 * but never propagates — accounting must never break the clinical billing flow.
 */
@Injectable()
export class HmisPostingService {
  private readonly logger = new Logger(HmisPostingService.name);

  constructor(private readonly ledger: LedgerService) {}

  /** Service type → revenue account. */
  private revenueAccount(serviceType?: string): string {
    switch ((serviceType ?? '').toLowerCase()) {
      case 'consultation':
        return ACCOUNTS.CONSULTATION_INCOME; // 41001
      case 'pharmacy':
        return ACCOUNTS.PHARMACY_SALES; // 42001
      case 'lab':
        return ACCOUNTS.LAB_INCOME; // 43001
      case 'imaging':
        return '44001'; // X-ray Income (radiology)
      case 'procedure':
        return '45001'; // Theatre Charges
      default:
        return '41004'; // Outpatient Revenue
    }
  }

  /** Which receivable a bill sits in, from its payment mode / scheme. */
  private receivableAccount(bill: {
    paymentMode?: string;
    status?: string;
    insuranceSchemeName?: string | null;
  }): string {
    const insured =
      bill.paymentMode === 'insurance' ||
      bill.paymentMode === 'split' ||
      bill.status === 'insurance_pending';
    if (insured) {
      const scheme = (bill.insuranceSchemeName ?? '').toLowerCase();
      if (/\bsha\b|shif/.test(scheme)) return ACCOUNTS.SHA_RECEIVABLE; // 12004
      return ACCOUNTS.INSURANCE_RECEIVABLE; // 12003
    }
    return ACCOUNTS.PATIENT_RECEIVABLE; // 12001
  }

  /** Payment method → the asset/receivable account the money lands in. */
  private paymentAccount(method?: string): string {
    switch ((method ?? '').toLowerCase()) {
      case 'mpesa':
        return ACCOUNTS.MOBILE_MONEY; // 11005
      case 'card':
        return ACCOUNTS.BANK_CURRENT; // 11003
      case 'insurance_claim':
        return ACCOUNTS.INSURANCE_RECEIVABLE; // 12003 (reclassified, not cash)
      case 'cash':
      default:
        return ACCOUNTS.CASH_ON_HAND; // 11001
    }
  }

  /**
   * Bill raised → recognise revenue against a receivable.
   *   Dr Receivable   Cr Revenue
   */
  async onBillCreated(bill: {
    id: string;
    facilityId: string;
    amount: number | string;
    serviceType?: string;
    serviceDescription?: string | null;
    paymentMode?: string;
    status?: string;
    insuranceSchemeName?: string | null;
  }): Promise<void> {
    await this.safe(bill.facilityId, 'bill', bill.id, async () => {
      const amount = Number(bill.amount);
      if (!(amount > 0)) return;
      const receivable = this.receivableAccount(bill);
      const revenue = this.revenueAccount(bill.serviceType);
      const desc = bill.serviceDescription || bill.serviceType || 'Service';
      await this.ledger.post({
        facilityId: bill.facilityId,
        source: 'billing',
        sourceType: 'bill',
        sourceId: bill.id,
        memo: `Bill: ${desc}`,
        lines: [
          { accountCode: receivable, debit: amount, description: desc, costCenter: bill.serviceType },
          { accountCode: revenue, credit: amount, description: desc, costCenter: bill.serviceType },
        ],
      });
    });
  }

  /**
   * Payment collected → clear the receivable into cash/bank/mobile.
   *   Dr Cash/Bank/Mobile   Cr Receivable
   * Not idempotency-guarded: each receipt (including partials) is its own
   * transaction.
   */
  async onPaymentCollected(
    bill: {
      id: string;
      facilityId: string;
      serviceType?: string;
      paymentMode?: string;
      status?: string;
      insuranceSchemeName?: string | null;
    },
    payment: { method: string; amount: number },
  ): Promise<void> {
    try {
      if (!(await this.ledger.hasChart(bill.facilityId))) return;
      const amount = Number(payment.amount);
      if (!(amount > 0)) return;
      const cash = this.paymentAccount(payment.method);
      const receivable = this.receivableAccount(bill);
      await this.ledger.post({
        facilityId: bill.facilityId,
        source: 'billing',
        sourceType: 'bill_payment',
        sourceId: bill.id,
        memo: `Payment via ${payment.method}`,
        lines: [
          { accountCode: cash, debit: amount, costCenter: bill.serviceType },
          { accountCode: receivable, credit: amount, costCenter: bill.serviceType },
        ],
      });
    } catch (e) {
      this.logger.error(`Payment posting failed for bill ${bill.id}: ${(e as Error).message}`);
    }
  }

  /**
   * Bill waived → write it off.
   *   Dr Bad Debts   Cr Receivable
   */
  async onBillWaived(bill: {
    id: string;
    facilityId: string;
    amount: number | string;
    amountPaid?: number | string;
    serviceType?: string;
    paymentMode?: string;
    status?: string;
    insuranceSchemeName?: string | null;
  }): Promise<void> {
    await this.safe(bill.facilityId, 'bill_waiver', bill.id, async () => {
      const outstanding = Number(bill.amount) - Number(bill.amountPaid ?? 0);
      if (!(outstanding > 0)) return;
      await this.ledger.post({
        facilityId: bill.facilityId,
        source: 'billing',
        sourceType: 'bill_waiver',
        sourceId: bill.id,
        memo: 'Bill waived (write-off)',
        lines: [
          { accountCode: '81002', debit: outstanding, costCenter: bill.serviceType }, // Bad Debts
          { accountCode: this.receivableAccount(bill), credit: outstanding, costCenter: bill.serviceType },
        ],
      });
    });
  }

  /**
   * Run a posting, skipping if there's no chart or it's already posted, and
   * swallowing errors so the caller's transaction is never affected.
   */
  private async safe(
    facilityId: string,
    sourceType: string,
    sourceId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      if (!(await this.ledger.hasChart(facilityId))) return;
      if (await this.ledger.alreadyPosted(facilityId, 'billing', sourceType, sourceId)) return;
      await fn();
    } catch (e) {
      this.logger.error(`Auto-post (${sourceType} ${sourceId}) failed: ${(e as Error).message}`);
    }
  }
}
