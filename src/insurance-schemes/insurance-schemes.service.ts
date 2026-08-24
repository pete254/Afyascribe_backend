import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsuranceScheme } from './entities/insurance-scheme.entity';
import { CreateInsuranceSchemeDto, UpdateInsuranceSchemeDto } from './dto/insurance-scheme.dto';
import { KENYA_INSURERS } from './data/kenya-insurers';
import { Billing, BillingStatus, PaymentMode } from '../billing/entities/billing.entity';

/** One line on an insurer's ledger — a single insurance-funded charge. */
export interface SchemeLedgerRow {
  id: string;
  date: Date;
  patientName: string;
  memberNumber: string | null;
  description: string;
  amount: number;
  settled: number;
  status: string;
  claimStatus: string | null;
  claimRef: string | null;
  /** Running outstanding balance owed by the insurer after this line. */
  balance: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class InsuranceSchemesService {
  constructor(
    @InjectRepository(InsuranceScheme)
    private readonly repo: Repository<InsuranceScheme>,
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
  ) {}

  /**
   * Seed the main Kenyan insurers for a facility, skipping any whose code is
   * already present. Idempotent — safe to call repeatedly. Returns how many were
   * added. Used both on demand (the "Seed Kenyan insurers" button) and lazily on
   * first access below.
   */
  async seedForFacility(facilityId: string): Promise<{ created: number }> {
    const existing = await this.repo.find({ where: { facilityId } });
    const have = new Set(existing.map((s) => s.code.toUpperCase()));
    const toAdd = KENYA_INSURERS.filter((i) => !have.has(i.code.toUpperCase())).map((i) =>
      this.repo.create({ facilityId, name: i.name, code: i.code.toUpperCase(), isActive: true }),
    );
    if (toAdd.length) await this.repo.save(toAdd);
    return { created: toAdd.length };
  }

  async create(dto: CreateInsuranceSchemeDto, facilityId: string): Promise<InsuranceScheme> {
    const existing = await this.repo.findOne({
      where: { facilityId, code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Scheme with code '${dto.code}' already exists`);
    }

    const scheme = this.repo.create({
      ...dto,
      code: dto.code.toUpperCase(),
      facilityId,
    });
    return this.repo.save(scheme);
  }

  async findAll(facilityId: string, activeOnly = true): Promise<InsuranceScheme[]> {
    // Auto-seed the Kenyan insurers the first time a facility has none, so a new
    // clinic starts with the list already populated. (Removing individual
    // insurers persists; only an entirely empty list re-seeds.)
    const count = await this.repo.count({ where: { facilityId } });
    if (count === 0) await this.seedForFacility(facilityId);

    const where: any = { facilityId };
    if (activeOnly) where.isActive = true;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string, facilityId: string): Promise<InsuranceScheme> {
    const scheme = await this.repo.findOne({ where: { id, facilityId } });
    if (!scheme) throw new NotFoundException(`Insurance scheme ${id} not found`);
    return scheme;
  }

  async update(id: string, dto: UpdateInsuranceSchemeDto, facilityId: string): Promise<InsuranceScheme> {
    const scheme = await this.findOne(id, facilityId);
    Object.assign(scheme, dto);
    return this.repo.save(scheme);
  }

  async remove(id: string, facilityId: string): Promise<void> {
    const scheme = await this.findOne(id, facilityId);
    await this.repo.remove(scheme);
  }

  /**
   * The full transaction ledger for one insurer: every insurance-funded charge
   * raised against the scheme, oldest first, with a running outstanding balance
   * (what the insurer still owes). Billing links to a scheme by name, so we
   * match on either the scheme name or the free-text insurer name a cashier may
   * have typed. Optionally bounded by a date range.
   */
  async ledger(
    id: string,
    facilityId: string,
    from?: Date,
    to?: Date,
  ): Promise<{
    scheme: InsuranceScheme;
    summary: { charged: number; settled: number; outstanding: number; count: number };
    rows: SchemeLedgerRow[];
  }> {
    const scheme = await this.findOne(id, facilityId);

    const qb = this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.payment_mode IN (:...modes)', {
        modes: [PaymentMode.INSURANCE, PaymentMode.SPLIT],
      })
      .andWhere('(b.insurance_scheme_name = :name OR b.insurer_name = :name)', {
        name: scheme.name,
      })
      .orderBy('b.created_at', 'ASC');

    if (from) qb.andWhere('b.created_at >= :from', { from });
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      qb.andWhere('b.created_at <= :to', { to: toEnd });
    }

    const bills = await qb.getMany();

    let charged = 0;
    let settled = 0;
    const rows: SchemeLedgerRow[] = bills.map((b) => {
      const amount = Number(b.amount) || 0;
      // A settled (paid) claim clears its whole amount; anything else is still owed.
      const paid = b.status === BillingStatus.PAID ? amount : Number(b.amountPaid) || 0;
      charged += amount;
      settled += paid;
      return {
        id: b.id,
        date: b.createdAt,
        patientName: b.patient
          ? `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim() || '—'
          : '—',
        memberNumber: b.memberNumber ?? null,
        description: b.serviceDescription ?? '—',
        amount: r2(amount),
        settled: r2(paid),
        status: b.status,
        claimStatus: b.claimStatus ?? null,
        claimRef: b.claimRef ?? null,
        balance: r2(charged - settled),
      };
    });

    return {
      scheme,
      summary: {
        charged: r2(charged),
        settled: r2(settled),
        outstanding: r2(charged - settled),
        count: rows.length,
      },
      rows,
    };
  }
}