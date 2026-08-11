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
import { HmisPostingService } from '../accounting/hmis-posting.service';
import { StockService } from '../inventory/stock.service';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
    // Posts the matching journal entries; best-effort, never blocks billing.
    private readonly posting: HmisPostingService,
    // Depletes stock + books COGS when a bill line dispenses a stock item.
    private readonly stock: StockService,
  ) {}

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