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

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
  ) {}

  // ── CREATE BILL ──────────────────────────────────────────────────────────
  async create(dto: CreateBillingDto, facilityId: string): Promise<Billing> {
    const visit = await this.visitsRepo.findOne({
      where: { id: dto.visitId, facilityId },
    });
    if (!visit) throw new NotFoundException(`Visit ${dto.visitId} not found`);

    const paymentMode = dto.paymentMode ?? PaymentMode.CASH;

    const bill = this.billingRepo.create({
      visitId: dto.visitId,
      patientId: visit.patientId,
      facilityId,
      serviceType: dto.serviceType,
      serviceDescription: dto.serviceDescription ?? null,
      amount: dto.amount,
      amountPaid: 0,
      paymentMode,
      insuranceSchemeName: dto.insuranceSchemeName ?? null,
      paymentHistory: [],
      status:
        paymentMode === PaymentMode.INSURANCE
          ? BillingStatus.INSURANCE_PENDING
          : BillingStatus.UNPAID,
    });

    const saved = await this.billingRepo.save(bill);

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

    const savedBill = await this.billingRepo.save(bill);
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
}