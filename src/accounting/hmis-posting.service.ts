import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerService } from './ledger.service';
import { ACCOUNTS } from './data/standard-coa';
import { InsuranceScheme } from '../insurance-schemes/entities/insurance-scheme.entity';

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

  constructor(
    private readonly ledger: LedgerService,
    @InjectRepository(InsuranceScheme)
    private readonly schemes: Repository<InsuranceScheme>,
  ) {}

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

  /**
   * Which receivable a bill sits in, from its payment mode / payer. Cash/self-pay
   * → Patient Receivable. On-account payers split by type: a corporate/employer
   * client → Corporate Debtors (12002); SHA/SHIF → SHA Receivable; any other
   * insurer → Insurance Receivable. The corporate split needs the payer's type,
   * which lives on the scheme, so this is a lookup by scheme name.
   */
  private async receivableAccount(bill: {
    facilityId: string;
    paymentMode?: string;
    status?: string;
    insuranceSchemeName?: string | null;
  }): Promise<string> {
    const insured =
      bill.paymentMode === 'insurance' ||
      bill.paymentMode === 'split' ||
      bill.status === 'insurance_pending';
    if (!insured) return ACCOUNTS.PATIENT_RECEIVABLE; // 12001

    const name = (bill.insuranceSchemeName ?? '').trim();
    if (name) {
      const scheme = await this.schemes.findOne({
        where: { facilityId: bill.facilityId, name },
      });
      if (scheme?.payerType === 'corporate') return '12002'; // Corporate Debtors
    }
    if (/\bsha\b|shif/.test(name.toLowerCase())) return ACCOUNTS.SHA_RECEIVABLE; // 12004
    return ACCOUNTS.INSURANCE_RECEIVABLE; // 12003
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
    isDeposit?: boolean;
  }): Promise<void> {
    // A deposit line is prepaid credit, not earned revenue — nothing is posted
    // when it's raised; the liability lands when the cashier collects it.
    if (bill.isDeposit) return;
    await this.safe(bill.facilityId, 'bill', bill.id, async () => {
      const amount = Number(bill.amount);
      if (!(amount > 0)) return;
      const receivable = await this.receivableAccount(bill);
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
      isDeposit?: boolean;
    },
    payment: { method: string; amount: number },
  ): Promise<void> {
    // A collected deposit is cash held as a patient-deposit liability — not the
    // clearing of a service receivable.
    if (bill.isDeposit) {
      const amount = Number(payment.amount);
      if (!(amount > 0)) return;
      await this.postWithDepositAccount(bill.facilityId, () =>
        this.ledger.post({
          facilityId: bill.facilityId,
          source: 'billing',
          sourceType: 'bill_payment',
          sourceId: bill.id,
          memo: `Deposit received via ${payment.method}`,
          lines: [
            { accountCode: this.paymentAccount(payment.method), debit: amount },
            { accountCode: ACCOUNTS.PATIENT_DEPOSITS, credit: amount },
          ],
        }),
      );
      return;
    }
    try {
      if (!(await this.ledger.hasChart(bill.facilityId))) return;
      const amount = Number(payment.amount);
      if (!(amount > 0)) return;
      const cash = this.paymentAccount(payment.method);
      const receivable = await this.receivableAccount(bill);
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
   * Admission deposit collected up front → cash lands as a patient-deposit
   * liability (the money isn't earned yet, it's held against future charges).
   *   Dr Cash/Bank/Mobile   Cr Patient Deposits
   */
  async onDepositCollected(input: {
    facilityId: string;
    admissionId: string;
    amount: number;
    method: string;
    memo?: string;
  }): Promise<void> {
    const amount = Number(input.amount);
    if (!(amount > 0)) return;
    await this.postWithDepositAccount(input.facilityId, () =>
      this.ledger.post({
        facilityId: input.facilityId,
        source: 'billing',
        sourceType: 'admission_deposit',
        sourceId: input.admissionId,
        memo: input.memo ?? 'Admission deposit',
        lines: [
          { accountCode: this.paymentAccount(input.method), debit: amount },
          { accountCode: ACCOUNTS.PATIENT_DEPOSITS, credit: amount },
        ],
      }),
    );
  }

  /**
   * A running-bill charge settled from the patient's held deposit → move the
   * deposit liability onto the receivable the bill raised.
   *   Dr Patient Deposits   Cr Receivable
   */
  async onDepositApplied(
    bill: {
      id: string;
      facilityId: string;
      serviceType?: string;
      paymentMode?: string;
      status?: string;
      insuranceSchemeName?: string | null;
    },
    amount: number,
  ): Promise<void> {
    const value = Number(amount);
    if (!(value > 0)) return;
    const receivable = await this.receivableAccount(bill);
    await this.postWithDepositAccount(bill.facilityId, () =>
      this.ledger.post({
        facilityId: bill.facilityId,
        source: 'billing',
        sourceType: 'deposit_applied',
        sourceId: bill.id,
        memo: 'Charge settled from deposit',
        lines: [
          { accountCode: ACCOUNTS.PATIENT_DEPOSITS, debit: value, costCenter: bill.serviceType },
          { accountCode: receivable, credit: value, costCenter: bill.serviceType },
        ],
      }),
    );
  }

  /**
   * Run a deposit-related post, tolerating a facility whose chart predates the
   * Patient Deposits account: seed the missing standard accounts once and retry.
   * Like the rest of this service, a persistent failure is logged, never thrown.
   */
  private async postWithDepositAccount(facilityId: string, run: () => Promise<unknown>): Promise<void> {
    try {
      if (!(await this.ledger.hasChart(facilityId))) return;
      await run();
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/Unknown account/i.test(msg)) {
        try {
          await this.ledger.seedChartOfAccounts(facilityId);
          await run();
          return;
        } catch (e2) {
          this.logger.error(`Deposit posting failed after reseed: ${(e2 as Error).message}`);
          return;
        }
      }
      this.logger.error(`Deposit posting failed: ${msg}`);
    }
  }

  /**
   * Catch-up payment for a bill that was paid before the chart existed. Unlike
   * onPaymentCollected (one journal per live collection), this posts a single
   * journal for the total already collected, and is idempotency-guarded so a
   * reconcile can be run repeatedly without double-posting.
   */
  async backfillPayment(
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
    if (!(payment.amount > 0)) return;
    if (await this.ledger.alreadyPosted(bill.facilityId, 'billing', 'bill_payment', bill.id)) return;
    await this.onPaymentCollected(bill, payment);
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
      const receivable = await this.receivableAccount(bill);
      await this.ledger.post({
        facilityId: bill.facilityId,
        source: 'billing',
        sourceType: 'bill_waiver',
        sourceId: bill.id,
        memo: 'Bill waived (write-off)',
        lines: [
          { accountCode: '81002', debit: outstanding, costCenter: bill.serviceType }, // Bad Debts
          { accountCode: receivable, credit: outstanding, costCenter: bill.serviceType },
        ],
      });
    });
  }

  // ── Inventory & procurement ─────────────────────────────────────────────────

  /**
   * Goods received → raise inventory and the payable.
   *   Dr Inventory (per line)   Cr Accounts Payable (supplier)
   * Returns the journal id, or null if skipped (no chart) / failed.
   */
  async onGoodsReceived(input: {
    facilityId: string;
    grnId: string;
    grnNo: string;
    date: string;
    supplierPayableCode: string;
    supplierName: string;
    total: number;
    lines: { inventoryAccountCode: string; value: number; description?: string }[];
  }): Promise<string | null> {
    if (!(input.total > 0)) return null;
    return this.tryPost({
      facilityId: input.facilityId,
      date: input.date,
      source: 'procurement',
      sourceType: 'goods_receipt',
      sourceId: input.grnId,
      memo: `GRN ${input.grnNo} — ${input.supplierName}`,
      lines: [
        ...input.lines.map((l) => ({
          accountCode: l.inventoryAccountCode,
          debit: l.value,
          description: l.description,
        })),
        { accountCode: input.supplierPayableCode, credit: input.total, description: input.supplierName },
      ],
    });
  }

  /**
   * Supplier paid → settle the payable from a bank/cash account.
   *   Dr Accounts Payable   Cr Bank/Cash
   */
  async onSupplierPayment(input: {
    facilityId: string;
    paymentId: string;
    paymentNo: string;
    date: string;
    payableCode: string;
    bankAccountCode: string;
    amount: number;
    supplierName: string;
  }): Promise<string | null> {
    if (!(input.amount > 0)) return null;
    return this.tryPost({
      facilityId: input.facilityId,
      date: input.date,
      source: 'procurement',
      sourceType: 'supplier_payment',
      sourceId: input.paymentId,
      memo: `Payment ${input.paymentNo} — ${input.supplierName}`,
      lines: [
        { accountCode: input.payableCode, debit: input.amount, description: input.supplierName },
        { accountCode: input.bankAccountCode, credit: input.amount },
      ],
    });
  }

  /**
   * Stock consumed/dispensed → expense it at cost.
   *   Dr COGS   Cr Inventory
   */
  async onStockIssue(input: {
    facilityId: string;
    date: string;
    cogsAccountCode: string;
    inventoryAccountCode: string;
    value: number;
    description?: string;
    costCenter?: string;
    sourceType?: string;
    sourceId?: string;
  }): Promise<string | null> {
    if (!(input.value > 0)) return null;
    return this.tryPost({
      facilityId: input.facilityId,
      date: input.date,
      source: 'inventory',
      sourceType: input.sourceType ?? 'stock_issue',
      sourceId: input.sourceId,
      memo: input.description ?? 'Stock issue',
      lines: [
        { accountCode: input.cogsAccountCode, debit: input.value, description: input.description, costCenter: input.costCenter },
        { accountCode: input.inventoryAccountCode, credit: input.value, costCenter: input.costCenter },
      ],
    });
  }

  /**
   * Stock adjustment → write value up or down.
   *   Loss (out): Dr Adjustment/COGS  Cr Inventory
   *   Gain (in):  Dr Inventory        Cr Adjustment/COGS
   */
  async onStockAdjustment(input: {
    facilityId: string;
    date: string;
    inventoryAccountCode: string;
    adjustmentAccountCode: string;
    value: number;
    direction: 'in' | 'out';
    description?: string;
    sourceType?: string;
    sourceId?: string;
  }): Promise<string | null> {
    if (!(input.value > 0)) return null;
    const inv = { accountCode: input.inventoryAccountCode, description: input.description };
    const adj = { accountCode: input.adjustmentAccountCode, description: input.description };
    const lines =
      input.direction === 'in'
        ? [{ ...inv, debit: input.value }, { ...adj, credit: input.value }]
        : [{ ...adj, debit: input.value }, { ...inv, credit: input.value }];
    return this.tryPost({
      facilityId: input.facilityId,
      date: input.date,
      source: 'inventory',
      sourceType: input.sourceType ?? 'stock_adjustment',
      sourceId: input.sourceId,
      memo: input.description ?? 'Stock adjustment',
      lines,
    });
  }

  // ── Payroll ─────────────────────────────────────────────────────────────────

  /**
   * Payroll accrued → recognise the wage cost and every payable.
   *   Dr Salaries Expense (gross + employer contributions)
   *   Cr PAYE / NSSF / SHIF / Housing payables, staff recoveries, Salaries Payable
   */
  async onPayrollAccrued(i: {
    facilityId: string;
    runId: string;
    runNo: string;
    date: string;
    gross: number;
    paye: number;
    nssfTotal: number;
    shif: number;
    housingTotal: number;
    otherDeductions: number;
    net: number;
    employerCost: number;
  }): Promise<string | null> {
    if (!(i.gross > 0)) return null;
    const memo = `Payroll ${i.runNo}`;
    const credits: { accountCode: string; credit: number; description?: string }[] = [
      { accountCode: '21006', credit: i.paye, description: 'PAYE' },
      { accountCode: '21007', credit: i.nssfTotal, description: 'NSSF' },
      { accountCode: '21008', credit: i.shif, description: 'SHIF' },
      { accountCode: '21009', credit: i.housingTotal, description: 'Housing Levy' },
      { accountCode: '12007', credit: i.otherDeductions, description: 'Staff recoveries' },
      { accountCode: '21005', credit: i.net, description: 'Net salaries payable' },
    ].filter((l) => l.credit > 0);

    return this.tryPost({
      facilityId: i.facilityId,
      date: i.date,
      source: 'payroll',
      sourceType: 'payroll_accrual',
      sourceId: i.runId,
      memo,
      lines: [
        { accountCode: '61001', debit: this.round(i.gross + i.employerCost), description: 'Salaries & wages' },
        ...credits,
      ],
    });
  }

  /**
   * Net pay disbursed → clear the salaries payable from the bank.
   *   Dr Salaries Payable   Cr Bank
   */
  async onPayrollPaid(i: {
    facilityId: string;
    runId: string;
    runNo: string;
    date: string;
    net: number;
    bankAccountCode: string;
  }): Promise<string | null> {
    if (!(i.net > 0)) return null;
    return this.tryPost({
      facilityId: i.facilityId,
      date: i.date,
      source: 'payroll',
      sourceType: 'payroll_payment',
      sourceId: i.runId,
      memo: `Payroll ${i.runNo} — net pay`,
      lines: [
        { accountCode: '21005', debit: i.net, description: 'Net salaries' },
        { accountCode: i.bankAccountCode, credit: i.net },
      ],
    });
  }

  private round(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  /** Post if a chart exists; return the journal id or null (never throws). */
  private async tryPost(input: Parameters<LedgerService['post']>[0]): Promise<string | null> {
    try {
      if (!(await this.ledger.hasChart(input.facilityId))) return null;
      const je = await this.ledger.post(input);
      return je.id;
    } catch (e) {
      this.logger.error(`Auto-post (${input.sourceType}) failed: ${(e as Error).message}`);
      return null;
    }
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
