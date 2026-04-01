// src/billing/billing.service.ts
// UPDATED: Added updateBill() and deleteBill() methods
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
      paymentMode,
      insuranceSchemeName: dto.insuranceSchemeName ?? null,
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
    if (bill.status !== BillingStatus.UNPAID) {
      throw new BadRequestException('Only unpaid bills can be edited');
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

  // ── COLLECT PAYMENT ──────────────────────────────────────────────────────
  async markPaid(
    billId: string,
    dto: CollectPaymentDto,
    collectedById: string,
    facilityId: string,
  ): Promise<{ bill: Billing; visit: PatientVisit | null }> {
    const bill = await this.billingRepo.findOne({ where: { id: billId, facilityId } });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID) {
      throw new BadRequestException('This bill is already marked as paid');
    }
    if (bill.status === BillingStatus.WAIVED) {
      throw new BadRequestException('This bill has been waived');
    }

    if (
      bill.paymentMode === PaymentMode.CASH &&
      dto.paymentMethod !== PaymentMethod.INSURANCE_CLAIM
    ) {
      if (dto.amountReceived < Number(bill.amount)) {
        throw new BadRequestException(
          `Amount received (KES ${dto.amountReceived}) is less than the bill amount (KES ${bill.amount}). Full payment is required.`,
        );
      }
    }

    bill.status = BillingStatus.PAID;
    bill.paidAt = new Date();
    bill.collectedById = collectedById;
    bill.paymentMethod = dto.paymentMethod;
    bill.mpesaReference = dto.mpesaReference ?? null;

    const savedBill = await this.billingRepo.save(bill);
    const visit = await this._tryAdvanceVisit(bill.visitId, facilityId);

    console.log(`✅ Payment collected: Bill ${billId} | ${dto.paymentMethod.toUpperCase()} | KES ${dto.amountReceived}`);
    return { bill: savedBill, visit };
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
    if (bill.status !== BillingStatus.UNPAID) {
      throw new BadRequestException('Only unpaid bills can be waived');
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
    hasPendingBills: boolean;
    hasInsuranceClaims: boolean;
  }> {
    const bills = await this.findByVisit(visitId, facilityId);
    const total = bills.reduce((s, b) => s + Number(b.amount), 0);
    const paid = bills
      .filter((b) => b.status === BillingStatus.PAID || b.status === BillingStatus.WAIVED)
      .reduce((s, b) => s + Number(b.amount), 0);
    const unpaid = bills
      .filter((b) => b.status === BillingStatus.UNPAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const hasInsuranceClaims = bills.some(
      (b) => b.status === BillingStatus.INSURANCE_PENDING,
    );

    return { total, paid, unpaid, hasPendingBills: unpaid > 0, hasInsuranceClaims };
  }

  // ── ADVANCE VISIT when all cash bills cleared ─────────────────────────────
  private async _tryAdvanceVisit(
    visitId: string,
    facilityId: string,
  ): Promise<PatientVisit | null> {
    const blockingBillCount = await this.billingRepo.count({
      where: { visitId, facilityId, status: BillingStatus.UNPAID },
    });

    const visit = await this.visitsRepo.findOne({ where: { id: visitId } });
    if (visit && blockingBillCount === 0 && visit.status === VisitStatus.CHECKED_IN) {
      visit.status = VisitStatus.WAITING_FOR_DOCTOR;
      await this.visitsRepo.save(visit);
      console.log(`🏥 Visit ${visitId} → WAITING_FOR_DOCTOR`);
      return visit;
    }
    return visit ?? null;
  }
}