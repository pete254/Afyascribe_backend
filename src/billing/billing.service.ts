// src/billing/billing.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Billing, BillingStatus } from './entities/billing.entity';
import { CreateBillingDto } from './dto/create-billing.dto';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
  ) {}

  // ── CREATE BILL (called at check-in time) ──────────────────────────────────
  async create(
    dto: CreateBillingDto,
    facilityId: string,
  ): Promise<Billing> {
    // Verify visit exists and belongs to this facility
    const visit = await this.visitsRepo.findOne({
      where: { id: dto.visitId, facilityId },
    });
    if (!visit) {
      throw new NotFoundException(`Visit ${dto.visitId} not found`);
    }

    const bill = this.billingRepo.create({
      visitId: dto.visitId,
      patientId: visit.patientId,
      facilityId,
      serviceType: dto.serviceType,
      serviceDescription: dto.serviceDescription ?? null,
      amount: dto.amount,
      status: BillingStatus.UNPAID,
    });

    const saved = await this.billingRepo.save(bill);

    console.log(`💰 Bill created: ${saved.id} | Visit: ${dto.visitId} | KES ${dto.amount}`);
    return saved;
  }

  // ── GET BILLS FOR A VISIT ──────────────────────────────────────────────────
  async findByVisit(visitId: string, facilityId: string): Promise<Billing[]> {
    return this.billingRepo.find({
      where: { visitId, facilityId },
      relations: ['collectedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  // ── GET ALL UNPAID BILLS FOR FACILITY (today) ──────────────────────────────
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

  // ── MARK AS PAID → advances visit to WAITING_FOR_DOCTOR ───────────────────
  async markPaid(
    billId: string,
    collectedById: string,
    facilityId: string,
  ): Promise<{ bill: Billing; visit: PatientVisit }> {
    const bill = await this.billingRepo.findOne({
      where: { id: billId, facilityId },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status === BillingStatus.PAID) {
      throw new BadRequestException('This bill is already marked as paid');
    }

    // Mark bill paid
    bill.status = BillingStatus.PAID;
    bill.paidAt = new Date();
    bill.collectedById = collectedById;
    const savedBill = await this.billingRepo.save(bill);

    // Check if ALL bills for this visit are now settled
    const unpaidCount = await this.billingRepo.count({
      where: {
        visitId: bill.visitId,
        facilityId,
        status: BillingStatus.UNPAID,
      },
    });

    // Advance visit status only when all bills are cleared
    const visit = await this.visitsRepo.findOne({ where: { id: bill.visitId } });
    if (visit && unpaidCount === 0 && visit.status === VisitStatus.CHECKED_IN) {
      visit.status = VisitStatus.WAITING_FOR_DOCTOR;
      await this.visitsRepo.save(visit);
      console.log(`✅ All bills cleared — Visit ${visit.id} advanced to WAITING_FOR_DOCTOR`);
    }

    return { bill: savedBill, visit };
  }

  // ── WAIVE BILL ─────────────────────────────────────────────────────────────
  async waive(
    billId: string,
    waiverReason: string | undefined,
    collectedById: string,
    facilityId: string,
  ): Promise<Billing> {
    const bill = await this.billingRepo.findOne({
      where: { id: billId, facilityId },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found`);
    if (bill.status !== BillingStatus.UNPAID) {
      throw new BadRequestException('Only unpaid bills can be waived');
    }

    bill.status = BillingStatus.WAIVED;
    bill.paidAt = new Date();
    bill.collectedById = collectedById;
    bill.waiverReason = waiverReason ?? null;
    const saved = await this.billingRepo.save(bill);

    // Same logic: advance visit if all settled
    const unpaidCount = await this.billingRepo.count({
      where: { visitId: bill.visitId, facilityId, status: BillingStatus.UNPAID },
    });
    if (unpaidCount === 0) {
      const visit = await this.visitsRepo.findOne({ where: { id: bill.visitId } });
      if (visit && visit.status === VisitStatus.CHECKED_IN) {
        visit.status = VisitStatus.WAITING_FOR_DOCTOR;
        await this.visitsRepo.save(visit);
      }
    }

    return saved;
  }

  // ── SUMMARY FOR VISIT (used in queue display) ──────────────────────────────
  async getVisitBillingSummary(
    visitId: string,
    facilityId: string,
  ): Promise<{ total: number; paid: number; unpaid: number; hasPendingBills: boolean }> {
    const bills = await this.findByVisit(visitId, facilityId);
    const total = bills.reduce((s, b) => s + Number(b.amount), 0);
    const paid = bills
      .filter((b) => b.status !== BillingStatus.UNPAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const unpaid = total - paid;
    return { total, paid, unpaid, hasPendingBills: unpaid > 0 };
  }
}