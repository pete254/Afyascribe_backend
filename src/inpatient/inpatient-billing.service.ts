import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admission } from './entities/admission.entity';
import { Ward } from './entities/ward.entity';
import { Billing, BillingStatus, ServiceType, PaymentMode } from '../billing/entities/billing.entity';
import { BillingService } from '../billing/billing.service';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** YYYY-MM-DD (UTC) for a date or date-ish value. */
const dateStr = (d: Date | string): string =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);

/** All calendar dates from `from` to `to` inclusive, as YYYY-MM-DD strings. */
function datesInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export interface RunningBillCharge {
  id: string;
  serviceType: string;
  description: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  status: string;
  createdAt: string | null;
}

export interface RunningBill {
  admissionId: string;
  visitId: string | null;
  charges: RunningBillCharge[];
  totalCharges: number;
  depositPaid: number;
  depositBalance: number;
  /** What the patient still owes once the deposit is applied. */
  outstanding: number;
}

/**
 * The inpatient running bill: a deposit is collected up front and every charge
 * (auto bed fees, issued drugs, ad-hoc services) draws it down. Once the deposit
 * is exhausted, further charges stay unpaid and block discharge until settled.
 */
@Injectable()
export class InpatientBillingService {
  constructor(
    @InjectRepository(Admission) private readonly admRepo: Repository<Admission>,
    @InjectRepository(Ward) private readonly wardRepo: Repository<Ward>,
    @InjectRepository(Billing) private readonly billingRepo: Repository<Billing>,
    private readonly billing: BillingService,
    private readonly posting: HmisPostingService,
  ) {}

  private async getAdmission(facilityId: string, admissionId: string): Promise<Admission> {
    const adm = await this.admRepo.findOne({ where: { id: admissionId, facilityId } });
    if (!adm) throw new NotFoundException('Admission not found');
    return adm;
  }

  /**
   * Materialise any missing daily bed fees up to today (or the discharge date),
   * one line per night from the admission day onward. Idempotent: `bedChargedThrough`
   * records how far we've charged, so re-running only adds new nights.
   * Only wards on the 'normal' (auto) charge mode with a positive rate accrue.
   */
  async accrueBedCharges(facilityId: string, admission: Admission): Promise<boolean> {
    if (!admission.visitId) return false;
    const ward = await this.wardRepo.findOne({ where: { id: admission.wardId, facilityId } });
    if (!ward || ward.bedChargeMode !== 'normal') return false;
    const rate = Number(ward.bedDailyCharge || 0);
    if (!(rate > 0)) return false;

    // Charge from the admission day (or the day after the last charged night) up
    // to today — or to the discharge date if the patient has left.
    const startFrom = admission.bedChargedThrough
      ? dateStr(new Date(new Date(`${admission.bedChargedThrough}T00:00:00Z`).getTime() + 86400000))
      : dateStr(admission.admittedAt);
    const endAt =
      admission.status === 'admitted'
        ? dateStr(new Date())
        : dateStr(admission.dischargedAt ?? new Date());
    if (startFrom > endAt) return false;

    const nights = datesInclusive(startFrom, endAt);
    if (nights.length === 0) return false;

    for (const night of nights) {
      await this.billing.create(
        {
          visitId: admission.visitId,
          serviceType: ServiceType.OTHER,
          serviceDescription: `Bed fee — ${ward.name} (${night})`,
          amount: r2(rate),
          paymentMode: PaymentMode.CASH,
        },
        facilityId,
      );
    }

    admission.bedChargedThrough = endAt;
    await this.admRepo.save(admission);
    return true;
  }

  /**
   * Apply the admission's remaining deposit to its outstanding charges, oldest
   * first, until either the deposit or the outstanding balance runs out.
   */
  async applyDeposit(facilityId: string, admission: Admission, userId?: string): Promise<void> {
    let balance = Number(admission.depositBalance || 0);
    if (!(balance > 0) || !admission.visitId) return;

    const unpaid = await this.billingRepo.find({
      where: { visitId: admission.visitId, facilityId, status: BillingStatus.UNPAID },
      order: { createdAt: 'ASC' },
    });

    for (const bill of unpaid) {
      if (!(balance > 0)) break;
      const remaining = Number(bill.amount) - Number(bill.amountPaid || 0);
      if (!(remaining > 0)) continue;
      const applied = await this.billing.settleFromDeposit(
        bill.id,
        Math.min(balance, remaining),
        facilityId,
        userId,
      );
      balance = r2(balance - applied);
    }

    admission.depositBalance = String(Math.max(0, balance));
    await this.admRepo.save(admission);
  }

  /** Collect (top up) an admission deposit and immediately apply it to charges. */
  async collectDeposit(
    facilityId: string,
    admissionId: string,
    dto: { amount: number; method?: string },
    userId?: string,
  ): Promise<RunningBill> {
    const admission = await this.getAdmission(facilityId, admissionId);
    const amount = r2(Number(dto.amount));
    if (!(amount > 0)) throw new BadRequestException('Deposit amount must be greater than 0');

    admission.depositPaid = String(r2(Number(admission.depositPaid || 0) + amount));
    admission.depositBalance = String(r2(Number(admission.depositBalance || 0) + amount));
    await this.admRepo.save(admission);

    await this.posting.onDepositCollected({
      facilityId,
      admissionId,
      amount,
      method: dto.method ?? 'cash',
    });

    await this.applyDeposit(facilityId, admission, userId);
    return this.getRunningBill(facilityId, admissionId);
  }

  /**
   * Add a charge to the running bill — an ad-hoc service or an issued drug.
   * When `itemId`+`quantity` are set the charge also depletes pharmacy stock and
   * books COGS (reusing the standard billing path). The deposit is applied after.
   */
  async addCharge(
    facilityId: string,
    admissionId: string,
    dto: {
      serviceType?: string;
      description: string;
      amount: number;
      itemId?: string;
      quantity?: number;
    },
    userId?: string,
  ): Promise<RunningBill> {
    const admission = await this.getAdmission(facilityId, admissionId);
    if (!admission.visitId) {
      throw new BadRequestException('This admission has no visit to bill against.');
    }
    const amount = r2(Number(dto.amount));
    if (!(amount >= 0)) throw new BadRequestException('Amount cannot be negative');

    const serviceType = (
      Object.values(ServiceType).includes(dto.serviceType as ServiceType)
        ? dto.serviceType
        : ServiceType.OTHER
    ) as ServiceType;

    await this.billing.create(
      {
        visitId: admission.visitId,
        serviceType,
        serviceDescription: dto.description,
        amount,
        paymentMode: PaymentMode.CASH,
        itemId: dto.itemId,
        quantity: dto.quantity,
      },
      facilityId,
    );

    await this.applyDeposit(facilityId, admission, userId);
    return this.getRunningBill(facilityId, admissionId);
  }

  /** The running bill, accruing any outstanding bed fees first. */
  async getRunningBill(facilityId: string, admissionId: string): Promise<RunningBill> {
    let admission = await this.getAdmission(facilityId, admissionId);

    if (admission.status === 'admitted') {
      const accrued = await this.accrueBedCharges(facilityId, admission);
      if (accrued) {
        await this.applyDeposit(facilityId, admission);
        admission = await this.getAdmission(facilityId, admissionId);
      }
    }

    const bills = admission.visitId
      ? await this.billingRepo.find({
          where: { visitId: admission.visitId, facilityId },
          order: { createdAt: 'ASC' },
        })
      : [];

    const charges: RunningBillCharge[] = bills.map((b) => {
      const amount = Number(b.amount);
      const amountPaid = Number(b.amountPaid || 0);
      return {
        id: b.id,
        serviceType: b.serviceType,
        description: b.serviceDescription,
        amount: r2(amount),
        amountPaid: r2(amountPaid),
        balance: r2(amount - amountPaid),
        status: b.status,
        createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
      };
    });

    const totalCharges = r2(charges.reduce((s, c) => s + c.amount, 0));
    const outstanding = r2(
      bills
        .filter((b) => b.status === BillingStatus.UNPAID)
        .reduce((s, b) => s + (Number(b.amount) - Number(b.amountPaid || 0)), 0),
    );

    return {
      admissionId,
      visitId: admission.visitId,
      charges,
      totalCharges,
      depositPaid: r2(Number(admission.depositPaid || 0)),
      depositBalance: r2(Number(admission.depositBalance || 0)),
      outstanding,
    };
  }

  /**
   * What the patient still owes after the deposit — used by the discharge guard.
   * Accrues final bed fees and applies deposit first so the figure is current.
   */
  async outstandingForDischarge(facilityId: string, admission: Admission): Promise<number> {
    await this.accrueBedCharges(facilityId, admission);
    await this.applyDeposit(facilityId, admission);
    if (!admission.visitId) return 0;
    const bills = await this.billingRepo.find({
      where: { visitId: admission.visitId, facilityId, status: BillingStatus.UNPAID },
    });
    return r2(
      bills.reduce((s, b) => s + (Number(b.amount) - Number(b.amountPaid || 0)), 0),
    );
  }
}
