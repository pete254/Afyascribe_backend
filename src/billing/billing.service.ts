// src/billing/billing.service.ts
// UPDATED: Partial payment support, multi-method payments, payment history
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Billing,
  BillingStatus,
  PaymentMode,
  PaymentMethod,
} from './entities/billing.entity';
import { CreateBillingDto } from './dto/create-billing.dto';
import { CollectPaymentDto } from './dto/mark-paid.dto';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { HmisPostingService } from '../accounting/hmis-posting.service';
import { StockService } from '../inventory/stock.service';

/** One line on a patient's financial statement — a charge, payment or credit. */
export interface PatientLedgerEntry {
  date: string | null;
  type: 'charge' | 'payment' | 'deposit' | 'waiver';
  description: string;
  visitId: string | null;
  method: string | null;
  charge: number;
  payment: number;
  /** Running balance the patient owes after this line. */
  balance: number;
}

/** A diagnosis recorded on the patient's record, for statement context. */
export interface PatientLedgerDiagnosis {
  date: string | null;
  codes: string[];
  text: string;
}

export interface PatientLedger {
  patient: { id: string; patientNo: string | null; name: string };
  summary: { charged: number; paid: number; balance: number };
  diagnoses: PatientLedgerDiagnosis[];
  entries: PatientLedgerEntry[];
}

/** One outstanding bill behind an aging figure — the drill-down unit. */
export interface AgingDrillBill {
  id: string;
  payer: string;
  type: 'cash' | 'insurer';
  bucket: 'current' | 'd30' | 'd60' | 'd90' | 'd90plus';
  patientName: string;
  patientNo: string | null;
  serviceType: string;
  serviceDescription: string | null;
  createdAt: string | null;
  ageDays: number;
  amount: number;
  amountPaid: number;
  owed: number;
  status: string;
  visitId: string | null;
}

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
    @InjectRepository(SoapNote)
    private readonly soapRepo: Repository<SoapNote>,
    // Posts the matching journal entries; best-effort, never blocks billing.
    private readonly posting: HmisPostingService,
    // Depletes stock + books COGS when a bill line dispenses a stock item.
    private readonly stock: StockService,
  ) {}

  // ── PATIENT LEDGER (STATEMENT) ─────────────────────────────────────────────
  // A patient's full financial statement: every charge, every payment, deposits
  // and waivers, in date order, with a running balance of what they owe. Built
  // from the billing rows (each charge, its partial-payment history, its waiver)
  // so the numbers always reconcile to the queue and the GL. Diagnoses recorded
  // on the patient's consultations are surfaced alongside for context.
  async patientLedger(
    patientId: string,
    facilityId: string,
    from?: Date,
    to?: Date,
  ): Promise<PatientLedger> {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const qb = this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .where('b.patient_id = :patientId', { patientId })
      .andWhere('b.facility_id = :facilityId', { facilityId })
      .orderBy('b.created_at', 'ASC');
    if (from) qb.andWhere('b.created_at >= :from', { from });
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      qb.andWhere('b.created_at <= :to', { to: toEnd });
    }
    const bills = await qb.getMany();

    // Flatten bills into dated events: charges, payments, deposits, waivers.
    type Ev = Omit<PatientLedgerEntry, 'balance'>;
    const events: Ev[] = [];
    for (const b of bills) {
      const amount = Number(b.amount) || 0;
      const isDeposit = b.isDeposit === true;

      // A deposit isn't a service charge — it only ever appears as money in
      // (a credit) once collected. Every other bill raises a charge.
      if (!isDeposit) {
        events.push({
          date: b.createdAt ? new Date(b.createdAt).toISOString() : null,
          type: 'charge',
          description: b.serviceDescription || 'Service charge',
          visitId: b.visitId ?? null,
          method: null,
          charge: amount,
          payment: 0,
        });
      }

      // Payments — prefer the detailed history; fall back to the paid total.
      const history = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
      if (history.length) {
        for (const p of history) {
          events.push({
            date: p.paidAt ? new Date(p.paidAt).toISOString() : null,
            type: isDeposit ? 'deposit' : 'payment',
            description: isDeposit
              ? 'Deposit received'
              : `Payment${p.paymentMethod ? ` (${p.paymentMethod})` : ''}`,
            visitId: b.visitId ?? null,
            method: p.paymentMethod ?? null,
            charge: 0,
            payment: Number(p.amount) || 0,
          });
        }
      } else if (Number(b.amountPaid) > 0) {
        events.push({
          date: b.paidAt ? new Date(b.paidAt).toISOString() : (b.createdAt ? new Date(b.createdAt).toISOString() : null),
          type: isDeposit ? 'deposit' : 'payment',
          description: isDeposit ? 'Deposit received' : 'Payment',
          visitId: b.visitId ?? null,
          method: b.paymentMethod ?? null,
          charge: 0,
          payment: Number(b.amountPaid) || 0,
        });
      }

      // A waiver writes off the unpaid remainder as a credit.
      if (b.status === BillingStatus.WAIVED) {
        const written = amount - (Number(b.amountPaid) || 0);
        if (written > 0) {
          events.push({
            date: b.paidAt ? new Date(b.paidAt).toISOString() : (b.createdAt ? new Date(b.createdAt).toISOString() : null),
            type: 'waiver',
            description: b.waiverReason ? `Waived — ${b.waiverReason}` : 'Waived',
            visitId: b.visitId ?? null,
            method: null,
            charge: 0,
            payment: written,
          });
        }
      }
    }

    // Chronological order, then compute the running balance.
    events.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    let balance = 0;
    let charged = 0;
    let paid = 0;
    const entries: PatientLedgerEntry[] = events.map((e) => {
      charged += e.charge;
      paid += e.payment;
      balance += e.charge - e.payment;
      return { ...e, balance: r2(balance) };
    });

    // Diagnoses recorded on the patient's consultations, for context.
    const notes = await this.soapRepo.find({
      where: { patientId },
      order: { createdAt: 'ASC' },
    });
    const diagnoses: PatientLedgerDiagnosis[] = notes
      .map((n) => {
        const codes = Array.isArray(n.icd10Codes)
          ? n.icd10Codes.map((c) => c.code).filter(Boolean)
          : n.icd10Code
            ? [n.icd10Code]
            : [];
        return {
          date: n.createdAt ? new Date(n.createdAt).toISOString() : null,
          codes,
          text: (n.diagnosis || n.icd10Description || '').trim(),
        };
      })
      .filter((d) => d.codes.length > 0 || d.text.length > 0);

    const first = bills[0];
    const p = first?.patient as any;
    return {
      patient: {
        id: patientId,
        patientNo: p?.patientId ?? null,
        name: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—' : '—',
      },
      summary: { charged: r2(charged), paid: r2(paid), balance: r2(charged - paid) },
      diagnoses,
      entries,
    };
  }

  // ── CREATE BILL ──────────────────────────────────────────────────────────
  async create(dto: CreateBillingDto, facilityId: string): Promise<Billing> {
    const visit = await this.visitsRepo.findOne({
      where: { id: dto.visitId, facilityId },
    });
    if (!visit) throw new NotFoundException(`Visit ${dto.visitId} not found`);

    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;

    // Insurance and split bills are claim lines — start them as pending claims.
    const isClaim = paymentMode === PaymentMode.INSURANCE || paymentMode === PaymentMode.SPLIT;

    const bill = this.billingRepo.create({
      visitId: dto.visitId,
      patientId: visit.patientId,
      facilityId,
      serviceType: dto.serviceType,
      serviceDescription: dto.serviceDescription ?? null,
      itemId: dto.itemId ?? null,
      quantity: dto.quantity ?? null,
      amount: dto.amount,
      amountPaid: 0,
      paymentMode,
      insuranceSchemeName: dto.insuranceSchemeName ?? null,
      insurerName: dto.insurerName ?? null,
      memberNumber: dto.memberNumber ?? null,
      claimStatus: isClaim ? 'pending' : null,
      paymentHistory: [],
      status:
        paymentMode === PaymentMode.INSURANCE
          ? BillingStatus.INSURANCE_PENDING
          : BillingStatus.UNPAID,
    });

    const saved = await this.billingRepo.save(bill);

    // Recognise revenue against a receivable (Dr Receivable, Cr Revenue).
    await this.posting.onBillCreated(saved);

    // If this line dispensed a stock item, deplete it and book COGS at cost.
    // Best-effort: a bad item link or empty stock must never fail the bill.
    if (dto.itemId && dto.quantity && dto.quantity > 0) {
      try {
        await this.stock.issueStock(facilityId, dto.itemId, dto.quantity, {
          sourceType: 'bill_dispense',
          sourceId: saved.id,
          costCenter: dto.serviceType,
          note: dto.serviceDescription ?? 'Dispensed',
        });
      } catch (e) {
        console.error(`Stock issue for bill ${saved.id} failed: ${(e as Error).message}`);
      }
    }

    // Insurance-only bills advance visit immediately
    if (paymentMode === PaymentMode.INSURANCE) {
      await this._tryAdvanceVisit(dto.visitId, facilityId);
    }

    console.log(`💰 Bill created: ${saved.id} | ${paymentMode.toUpperCase()} | KES ${dto.amount}`);
    return saved;
  }

  // ── UPDATE BILL (amount / description — unpaid only) ──────────────────────
  async updateBill(
    billId: string,
    data: { amount?: number; serviceDescription?: string },
    facilityId: string,
  ): Promise<Billing> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID) {
      throw new BadRequestException('Paid bills cannot be edited');
    }
    if (bill.status === BillingStatus.WAIVED) {
      throw new BadRequestException('Waived bills cannot be edited');
    }
    if (data.amount !== undefined) bill.amount = data.amount;
    if (data.serviceDescription !== undefined) bill.serviceDescription = data.serviceDescription;
    return this.billingRepo.save(bill);
  }

  // ── DELETE BILL (unpaid only) ──────────────────────────────────────────────
  async deleteBill(billId: string, facilityId: string): Promise<void> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status !== BillingStatus.UNPAID) {
      throw new BadRequestException('Only unpaid bills can be deleted');
    }
    await this.billingRepo.remove(bill);
    console.log(`🗑️ Bill deleted: ${billId}`);
  }

  // ── GET BILLS FOR A VISIT ────────────────────────────────────────────────
  async findByVisit(visitId: string, facilityId: string): Promise<Billing[]> {
    return this.billingRepo.find({
      where: { visitId, facilityId },
      relations: ['collectedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  // ── GET ALL UNPAID BILLS FOR FACILITY (today) ─────────────────────────────
  async findUnpaidToday(facilityId: string): Promise<Billing[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.billingRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.patient', 'patient')
      .leftJoinAndSelect('bill.visit', 'visit')
      .where('bill.facility_id = :facilityId', { facilityId })
      .andWhere('bill.status = :status', { status: BillingStatus.UNPAID })
      .andWhere('bill.created_at >= :today', { today })
      .orderBy('bill.created_at', 'DESC')
      .getMany();
  }

  /**
   * Unpaid bills raised before today — money that was never collected on earlier
   * days. Oldest first, so the front desk can chase the longest-standing ones.
   */
  async findOutstandingOlder(facilityId: string): Promise<Billing[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.billingRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.patient', 'patient')
      .leftJoinAndSelect('bill.visit', 'visit')
      .where('bill.facility_id = :facilityId', { facilityId })
      .andWhere('bill.status = :status', { status: BillingStatus.UNPAID })
      .andWhere('bill.created_at < :today', { today })
      .orderBy('bill.created_at', 'ASC')
      .getMany();
  }

  /**
   * Accounts-receivable aging. Every bill with money still owed (unpaid or
   * part-paid, cash or insurance) is bucketed by how long it has been
   * outstanding as of `asOf`, and grouped by payer (the insurer, or "Cash /
   * self-pay"). This is the classic 30/60/90 report finance uses to chase debt.
   */
  async agingReport(
    facilityId: string,
    asOf?: string,
  ): Promise<{
    asOf: string;
    buckets: string[];
    payers: {
      payer: string;
      type: 'cash' | 'insurer';
      current: number;
      d30: number;
      d60: number;
      d90: number;
      d90plus: number;
      total: number;
    }[];
    totals: { current: number; d30: number; d60: number; d90: number; d90plus: number; total: number };
    bills: AgingDrillBill[];
  }> {
    const asOfDate = asOf ? new Date(`${asOf}T23:59:59.999`) : new Date();
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.patient', 'patient')
      .leftJoinAndSelect('bill.visit', 'visit')
      .leftJoinAndSelect('visit.patient', 'visitPatient')
      .where('bill.facility_id = :facilityId', { facilityId })
      .andWhere('bill.status IN (:...statuses)', {
        statuses: [BillingStatus.UNPAID, BillingStatus.INSURANCE_PENDING],
      })
      .andWhere('bill.created_at <= :asOf', { asOf: asOfDate })
      .getMany();

    type Row = {
      payer: string;
      type: 'cash' | 'insurer';
      current: number; d30: number; d60: number; d90: number; d90plus: number; total: number;
    };
    const map = new Map<string, Row>();
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
    // The individual bills behind every figure — so the UI can drill from any
    // bucket cell or card down to the exact debts that make it up.
    const drill: AgingDrillBill[] = [];

    for (const b of bills) {
      const owed = Number(b.amount) - Number(b.amountPaid || 0);
      if (owed <= 0.009) continue;

      const isInsurer = b.paymentMode === PaymentMode.INSURANCE || b.paymentMode === PaymentMode.SPLIT;
      const payer = isInsurer ? b.insurerName || b.insuranceSchemeName || 'Insurer (unspecified)' : 'Cash / self-pay';
      const key = `${isInsurer ? 'I' : 'C'}:${payer}`;

      const days = Math.floor((asOfDate.getTime() - new Date(b.createdAt).getTime()) / 86400000);
      const bucket =
        days <= 30 ? 'current' : days <= 60 ? 'd30' : days <= 90 ? 'd60' : days <= 120 ? 'd90' : 'd90plus';

      const row = map.get(key) ?? {
        payer, type: isInsurer ? 'insurer' as const : 'cash' as const,
        current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0,
      };
      row[bucket] = r2(row[bucket] + owed);
      row.total = r2(row.total + owed);
      totals[bucket] = r2(totals[bucket] + owed);
      totals.total = r2(totals.total + owed);
      map.set(key, row);

      const person = b.patient ?? b.visit?.patient;
      drill.push({
        id: b.id,
        payer,
        type: isInsurer ? 'insurer' : 'cash',
        bucket,
        patientName: person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
        patientNo: person?.patientId ?? null,
        serviceType: b.serviceType,
        serviceDescription: b.serviceDescription ?? null,
        createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
        ageDays: days,
        amount: r2(Number(b.amount)),
        amountPaid: r2(Number(b.amountPaid || 0)),
        owed: r2(owed),
        status: b.status,
        visitId: b.visitId ?? null,
      });
    }

    const payers = [...map.values()].sort((a, b) => b.total - a.total);
    return {
      asOf: asOfDate.toISOString().slice(0, 10),
      buckets: ['0–30 days', '31–60 days', '61–90 days', '91–120 days', 'Over 120 days'],
      payers,
      totals,
      bills: drill,
    };
  }

  // ── COLLECT PARTIAL or FULL PAYMENT ──────────────────────────────────────
  async collectPayment(
    billId: string,
    dto: {
      paymentMethod: string;
      amountReceived: number;
      mpesaReference?: string;
      collectedById: string;
    },
    facilityId: string,
  ): Promise<{ bill: Billing; visit: PatientVisit | null; isFullyPaid: boolean }> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID) {
      throw new BadRequestException('This bill is already marked as paid');
    }
    if (bill.status === BillingStatus.WAIVED) {
      throw new BadRequestException('This bill has been waived');
    }

    const remaining = Number(bill.amount) - Number(bill.amountPaid || 0);
    if (dto.amountReceived <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }
    if (dto.amountReceived > remaining) {
      throw new BadRequestException(
        `Payment (KES ${dto.amountReceived}) exceeds outstanding balance (KES ${remaining})`,
      );
    }

    // Record this payment in history
    const paymentRecord = {
      paymentMethod: dto.paymentMethod,
      amount: dto.amountReceived,
      mpesaReference: dto.mpesaReference,
      paidAt: new Date().toISOString(),
      collectedById: dto.collectedById,
    };

    bill.amountPaid = Number(bill.amountPaid || 0) + dto.amountReceived;
    bill.paymentHistory = [...(bill.paymentHistory || []), paymentRecord];
    bill.collectedById = dto.collectedById;

    const isFullyPaid = bill.amountPaid >= Number(bill.amount);

    if (isFullyPaid) {
      bill.status = BillingStatus.PAID;
      bill.paidAt = new Date();
      bill.paymentMethod = dto.paymentMethod as PaymentMethod;
      bill.mpesaReference = dto.mpesaReference ?? null;
    }

    // Advance the claim lifecycle for insurance/copay bills as money comes in.
    if (bill.claimStatus && bill.claimStatus !== 'rejected') {
      bill.claimStatus = isFullyPaid ? 'paid' : 'part_paid';
    }

    const savedBill = await this.billingRepo.save(bill);

    // Clear the receivable into cash/bank/mobile (Dr Cash, Cr Receivable).
    await this.posting.onPaymentCollected(savedBill, {
      method: dto.paymentMethod,
      amount: dto.amountReceived,
    });

    let visit: PatientVisit | null = null;

    if (isFullyPaid) {
      visit = await this._tryAdvanceVisit(bill.visitId, facilityId);
    }

    console.log(
      `✅ Payment collected: Bill ${billId} | ${dto.paymentMethod.toUpperCase()} | KES ${dto.amountReceived} | Fully paid: ${isFullyPaid}`,
    );
    return { bill: savedBill, visit, isFullyPaid };
  }

  /**
   * Settle part or all of a bill from an admission's prepaid deposit. Behaves
   * like a collection but the money moves off the held deposit liability rather
   * than a fresh cash receipt (Dr Patient Deposits, Cr Receivable). Returns how
   * much was actually applied (capped at the outstanding balance).
   */
  async settleFromDeposit(
    billId: string,
    amount: number,
    facilityId: string,
    collectedById?: string,
  ): Promise<number> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID || bill.status === BillingStatus.WAIVED) return 0;

    const remaining = Number(bill.amount) - Number(bill.amountPaid || 0);
    const applied = Math.min(Number(amount), remaining);
    if (!(applied > 0)) return 0;

    bill.amountPaid = Number(bill.amountPaid || 0) + applied;
    bill.paymentHistory = [
      ...(bill.paymentHistory || []),
      {
        paymentMethod: 'deposit',
        amount: applied,
        paidAt: new Date().toISOString(),
        collectedById: collectedById ?? '',
      },
    ];
    if (collectedById) bill.collectedById = collectedById;

    const isFullyPaid = bill.amountPaid >= Number(bill.amount);
    if (isFullyPaid) {
      bill.status = BillingStatus.PAID;
      bill.paidAt = new Date();
      bill.paymentMethod = 'deposit' as PaymentMethod;
    }

    const saved = await this.billingRepo.save(bill);
    // Move the held deposit onto the receivable (Dr Patient Deposits, Cr Receivable).
    await this.posting.onDepositApplied(saved, applied);
    return applied;
  }

  // ── LEGACY markPaid (kept for backward compat) ────────────────────────────
  async markPaid(
    billId: string,
    dto: CollectPaymentDto,
    collectedById: string,
    facilityId: string,
  ): Promise<{ bill: Billing; visit: PatientVisit | null }> {
    const result = await this.collectPayment(
      billId,
      {
        paymentMethod: dto.paymentMethod,
        amountReceived: dto.amountReceived,
        mpesaReference: dto.mpesaReference,
        collectedById,
      },
      facilityId,
    );
    return { bill: result.bill, visit: result.visit };
  }

  // ── WAIVE BILL ───────────────────────────────────────────────────────────
  async waive(
    billId: string,
    waiverReason: string | undefined,
    collectedById: string,
    facilityId: string,
  ): Promise<Billing> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID) {
      throw new BadRequestException('Cannot waive an already paid bill');
    }

    bill.status = BillingStatus.WAIVED;
    bill.paidAt = new Date();
    bill.collectedById = collectedById;
    bill.waiverReason = waiverReason ?? null;
    const saved = await this.billingRepo.save(bill);

    // Write off the outstanding balance (Dr Bad Debts, Cr Receivable).
    await this.posting.onBillWaived(saved);

    await this._tryAdvanceVisit(bill.visitId, facilityId);
    return saved;
  }

  // ── SUMMARY FOR VISIT ────────────────────────────────────────────────────
  async getVisitBillingSummary(
    visitId: string,
    facilityId: string,
  ): Promise<{
    total: number;
    paid: number;
    unpaid: number;
    amountPaid: number;
    hasPendingBills: boolean;
    hasInsuranceClaims: boolean;
  }> {
    const bills = await this.findByVisit(visitId, facilityId);
    const total = bills.reduce((s, b) => s + Number(b.amount), 0);
    const paid = bills
      .filter((b) => b.status === BillingStatus.PAID || b.status === BillingStatus.WAIVED)
      .reduce((s, b) => s + Number(b.amount), 0);
    const amountPaid = bills.reduce((s, b) => s + Number(b.amountPaid || 0), 0);
    const unpaid = bills
      .filter((b) => b.status === BillingStatus.UNPAID)
      .reduce((s, b) => s + (Number(b.amount) - Number(b.amountPaid || 0)), 0);
    const hasInsuranceClaims = bills.some(
      (b) => b.status === BillingStatus.INSURANCE_PENDING,
    );

    return { total, paid, unpaid, amountPaid, hasPendingBills: unpaid > 0, hasInsuranceClaims };
  }

  // ── ADVANCE VISIT when all cash bills cleared ─────────────────────────────
  private async _tryAdvanceVisit(
    visitId: string,
    facilityId: string,
  ): Promise<PatientVisit | null> {
    // Check if any bills still have remaining balance
    const unpaidBills = await this.billingRepo
      .createQueryBuilder('bill')
      .where('bill.visitId = :visitId', { visitId })
      .andWhere('bill.facilityId = :facilityId', { facilityId })
      .andWhere('bill.status = :status', { status: BillingStatus.UNPAID })
      .getMany();

    // Count bills with remaining balance
    const billsWithBalance = unpaidBills.filter(
      b => Number(b.amount) - Number(b.amountPaid || 0) > 0,
    );

    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (visit && billsWithBalance.length === 0 && visit.status === VisitStatus.CHECKED_IN) {
      visit.status = VisitStatus.WAITING_FOR_DOCTOR;
      await this.visitsRepo.save(visit);
      console.log(`🏥 Visit ${visitId} → WAITING_FOR_DOCTOR`);
      return visit;
    }
    return visit ?? null;
  }

  // ── RECONCILE EXISTING BILLS INTO THE LEDGER ──────────────────────────────
  /**
   * Post the journals for bills/payments that predate the chart of accounts.
   * Auto-posting is skipped when no chart exists, so anything billed before the
   * facility set up its books never hit the ledger — this catches them up.
   * Every step is idempotency-guarded, so it is safe to run more than once.
   */
  async reconcileLedger(facilityId: string): Promise<{ bills: number }> {
    const bills = await this.billingRepo.find({ where: { facilityId } });
    for (const bill of bills) {
      // Revenue recognition (guarded inside the posting service).
      await this.posting.onBillCreated(bill);

      if (bill.status === BillingStatus.WAIVED) {
        await this.posting.onBillWaived(bill);
      } else if (Number(bill.amountPaid) > 0) {
        await this.posting.backfillPayment(bill, {
          method: bill.paymentMethod ?? 'cash',
          amount: Number(bill.amountPaid),
        });
      }
    }
    return { bills: bills.length };
  }

  // ── GET ALL BILLS FOR RECEIPTS/REPORTING ─────────────────────────────────
  async findPaidBills(
    facilityId: string,
    from: Date,
    to: Date,
  ): Promise<Billing[]> {
    const toEndOfDay = new Date(to);
    toEndOfDay.setHours(23, 59, 59, 999);

    return this.billingRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.patient', 'patient')
      .leftJoinAndSelect('bill.visit', 'visit')
      .leftJoinAndSelect('bill.collectedBy', 'collectedBy')
      .where('bill.facility_id = :facilityId', { facilityId })
      .andWhere('bill.status IN (:...statuses)', {
        statuses: [BillingStatus.PAID, BillingStatus.WAIVED],
      })
      .andWhere('bill.paid_at >= :from', { from })
      .andWhere('bill.paid_at <= :to', { to: toEndOfDay })
      .orderBy('bill.paid_at', 'DESC')
      .getMany();
  }

  // ── INSURANCE CLAIMS ───────────────────────────────────────────────────────
  // Insurance/copay bills are the claim lines. These read and drive the claims
  // register; marking a claim paid goes through collectPayment (method
  // insurance_claim), so the ledger stays correct.

  /**
   * Claims for the facility, filterable by insurer, scheme, patient, claim
   * status and date. `status='due'` means anything still owing (pending,
   * submitted or part-paid — not fully paid or rejected).
   */
  async findClaims(
    facilityId: string,
    filter: {
      status?: string;
      insurer?: string;
      scheme?: string;
      patientId?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Billing[]> {
    const qb = this.billingRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.patient', 'patient')
      .leftJoinAndSelect('bill.visit', 'visit')
      .where('bill.facility_id = :facilityId', { facilityId })
      .andWhere('bill.payment_mode IN (:...modes)', { modes: ['insurance', 'split'] });

    if (filter.status === 'due') {
      qb.andWhere('bill.claim_status IN (:...due)', { due: ['pending', 'submitted', 'part_paid'] });
    } else if (filter.status) {
      qb.andWhere('bill.claim_status = :cs', { cs: filter.status });
    }
    if (filter.insurer) qb.andWhere('bill.insurer_name = :insurer', { insurer: filter.insurer });
    if (filter.scheme) qb.andWhere('bill.insurance_scheme_name = :scheme', { scheme: filter.scheme });
    if (filter.patientId) qb.andWhere('bill.patient_id = :pid', { pid: filter.patientId });
    if (filter.from) qb.andWhere('bill.created_at >= :from', { from: new Date(filter.from) });
    if (filter.to) {
      const end = new Date(filter.to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('bill.created_at <= :to', { to: end });
    }

    return qb.orderBy('bill.created_at', 'DESC').getMany();
  }

  /**
   * Per-insurer performance: what was billed, collected and is still outstanding,
   * claim counts, and the average days an insurer takes to pay a claim.
   */
  async claimsSummary(
    facilityId: string,
    filter: { from?: string; to?: string } = {},
  ): Promise<{
    rows: {
      insurer: string;
      billed: number;
      paid: number;
      outstanding: number;
      claims: number;
      paidClaims: number;
      rejectedClaims: number;
      dueClaims: number;
      avgDaysToPay: number | null;
    }[];
    totals: { billed: number; paid: number; outstanding: number; claims: number };
  }> {
    const bills = await this.findClaims(facilityId, { from: filter.from, to: filter.to });

    const map = new Map<
      string,
      {
        billed: number; paid: number; claims: number; paidClaims: number;
        rejectedClaims: number; dueClaims: number; payDays: number[];
      }
    >();

    for (const b of bills) {
      const key = b.insurerName || b.insuranceSchemeName || 'Unspecified';
      const g = map.get(key) ?? {
        billed: 0, paid: 0, claims: 0, paidClaims: 0, rejectedClaims: 0, dueClaims: 0, payDays: [],
      };
      const amount = Number(b.amount);
      const paid = Number(b.amountPaid || 0);
      g.billed += amount;
      g.paid += paid;
      g.claims += 1;
      if (b.claimStatus === 'paid') {
        g.paidClaims += 1;
        if (b.paidAt) {
          const days = (new Date(b.paidAt).getTime() - new Date(b.createdAt).getTime()) / 86400000;
          if (days >= 0) g.payDays.push(days);
        }
      } else if (b.claimStatus === 'rejected') {
        g.rejectedClaims += 1;
      } else {
        g.dueClaims += 1;
      }
      map.set(key, g);
    }

    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const rows = [...map.entries()]
      .map(([insurer, g]) => ({
        insurer,
        billed: r2(g.billed),
        paid: r2(g.paid),
        // Rejected claims aren't a receivable — exclude them from outstanding.
        outstanding: r2(g.billed - g.paid),
        claims: g.claims,
        paidClaims: g.paidClaims,
        rejectedClaims: g.rejectedClaims,
        dueClaims: g.dueClaims,
        avgDaysToPay: g.payDays.length
          ? Math.round(g.payDays.reduce((s, d) => s + d, 0) / g.payDays.length)
          : null,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    const totals = rows.reduce(
      (t, r) => ({
        billed: r2(t.billed + r.billed),
        paid: r2(t.paid + r.paid),
        outstanding: r2(t.outstanding + r.outstanding),
        claims: t.claims + r.claims,
      }),
      { billed: 0, paid: 0, outstanding: 0, claims: 0 },
    );

    return { rows, totals };
  }

  /** Update a claim's status/reference (submit to insurer, reject, reopen). */
  async updateClaim(
    billId: string,
    data: { claimStatus?: string; claimRef?: string },
    facilityId: string,
  ): Promise<Billing> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.paymentMode !== PaymentMode.INSURANCE && bill.paymentMode !== PaymentMode.SPLIT) {
      throw new BadRequestException('This bill is not an insurance claim');
    }
    if (data.claimStatus) {
      const allowed = ['pending', 'submitted', 'part_paid', 'paid', 'rejected'];
      if (!allowed.includes(data.claimStatus)) {
        throw new BadRequestException('Invalid claim status');
      }
      bill.claimStatus = data.claimStatus;
      if (data.claimStatus === 'submitted' && !bill.claimSubmittedAt) {
        bill.claimSubmittedAt = new Date();
      }
    }
    if (data.claimRef !== undefined) bill.claimRef = data.claimRef || null;
    return this.billingRepo.save(bill);
  }
}