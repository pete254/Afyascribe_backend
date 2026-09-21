// src/service-catalog/service-catalog.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OclClient } from '../terminology/ocl.client';
import { Repository } from 'typeorm';
import {
  ServiceCatalogItem,
  ServiceCategory,
} from './entities/service-catalog.entity';
import {
  CreateServiceCatalogDto,
  UpdateServiceCatalogDto,
} from './dto/service-catalog.dto';

// Default services seeded when a facility is first set up
const DEFAULT_SERVICES: Omit<CreateServiceCatalogDto, 'sortOrder'>[] = [
  { name: 'General Consultation',       category: ServiceCategory.CONSULTATION, defaultPrice: 500,    description: 'Standard outpatient consultation' },
  { name: 'Specialist Consultation',    category: ServiceCategory.CONSULTATION, defaultPrice: 1500,   description: 'Specialist doctor consultation' },
  { name: 'Full Blood Count (FBC)',      category: ServiceCategory.LAB,          defaultPrice: 800,    description: 'Complete blood count' },
  { name: 'Blood Sugar (RBS)',           category: ServiceCategory.LAB,          defaultPrice: 300,    description: 'Random blood sugar test' },
  { name: 'Urinalysis',                  category: ServiceCategory.LAB,          defaultPrice: 400,    description: 'Urine analysis' },
  { name: 'Malaria Test (RDT)',          category: ServiceCategory.LAB,          defaultPrice: 350,    description: 'Rapid Diagnostic Test for malaria' },
  { name: 'HIV Test',                    category: ServiceCategory.LAB,          defaultPrice: 200,    description: 'HIV rapid test' },
  { name: 'Renal Function Tests',        category: ServiceCategory.LAB,          defaultPrice: 1200,   description: 'Kidney function panel' },
  { name: 'Liver Function Tests',        category: ServiceCategory.LAB,          defaultPrice: 1200,   description: 'Liver function panel' },
  { name: 'Chest X-Ray',                 category: ServiceCategory.IMAGING,      defaultPrice: 1500,   description: 'Standard chest X-ray' },
  { name: 'Abdominal Ultrasound',        category: ServiceCategory.IMAGING,      defaultPrice: 2500,   description: 'Abdominal ultrasound scan' },
  { name: 'Pelvic Ultrasound',           category: ServiceCategory.IMAGING,      defaultPrice: 2500,   description: 'Pelvic ultrasound scan' },
  { name: 'Dressing (Minor)',            category: ServiceCategory.PROCEDURE,     defaultPrice: 300,    description: 'Minor wound dressing' },
  { name: 'Dressing (Major)',            category: ServiceCategory.PROCEDURE,     defaultPrice: 800,    description: 'Major wound dressing' },
  { name: 'Injection / IV Drip Setup',  category: ServiceCategory.NURSING,       defaultPrice: 200,    description: 'IV line insertion or injection' },
  { name: 'Prescription Dispensing',    category: ServiceCategory.PHARMACY,      defaultPrice: 0,      description: 'Pharmacy dispensing fee' },
];

@Injectable()
export class ServiceCatalogService {
  private readonly logger = new Logger(ServiceCatalogService.name);

  constructor(
    @InjectRepository(ServiceCatalogItem)
    private readonly repo: Repository<ServiceCatalogItem>,
    private readonly ocl: OclClient,
  ) {}

  // ── National procedure lists (WHO ICHI via KNHTS) ────────────────────────

  /**
   * Import one section of ICHI as catalogue items, coded to the ICHI code and
   * skipping codes already present. Dental (teeth KAE.*, gums KAG.*) is small
   * and fully relevant so it comes in active; the eye chapter (B**.*) is the
   * whole of eye surgery, so it comes in inactive for the clinic to activate
   * what it offers. Prices start at zero (see suggestedPrice).
   */
  async importIchiSection(facilityId: string, section: 'dental' | 'eye'): Promise<number> {
    const match = section === 'dental' ? /^KA[EG]\.[A-Z]{2}\.[A-Z]{2}$/ : /^B[A-Z]{2}\.[A-Z]{2}\.[A-Z]{2}$/;
    const category = section === 'dental' ? ServiceCategory.DENTAL : ServiceCategory.OPTICAL;
    const isActive = section === 'dental';
    const existing = new Set(
      (await this.repo.find({ where: { facilityId }, select: ['knhtsCode'] })).map((c) => c.knhtsCode).filter(Boolean) as string[],
    );
    const limit = 100;
    let created = 0;
    for (let page = 1; page <= 400; page++) {
      const batch = await this.ocl.concepts('WHO', 'ICHI', page, limit);
      if (!batch.length) break;
      const rows = batch
        .filter((c) => match.test(c.id) && !existing.has(c.id))
        .map((c) =>
          this.repo.create({
            facilityId,
            name: (c.display_name || c.id).slice(0, 200),
            knhtsCode: c.id,
            knhtsName: c.display_name || null,
            category,
            defaultPrice: 0,
            isActive,
            sortOrder: 0,
          }),
        );
      if (rows.length) {
        await this.repo.save(rows);
        rows.forEach((r) => existing.add(r.knhtsCode as string));
        created += rows.length;
      }
      if (batch.length < limit) break;
    }
    this.logger.log(`ICHI ${section}: ${created} catalogue items imported`);
    return created;
  }

  /**
   * An ad-hoc amount charged for a service with no default price: remember it
   * as the suggestion, optionally make it the default price.
   */
  async rememberPrice(facilityId: string, id: string, price: number, saveAsDefault: boolean): Promise<void> {
    const item = await this.repo.findOne({ where: { id, facilityId } });
    if (!item || !(price > 0) || Number(item.defaultPrice) > 0) return;
    item.suggestedPrice = price.toFixed(2);
    if (saveAsDefault) item.defaultPrice = price;
    await this.repo.save(item);
  }

  // ── Seed defaults for a new facility ──────────────────────────────────────
  async seedDefaults(facilityId: string): Promise<void> {
    const existing = await this.repo.count({ where: { facilityId } });
    if (existing > 0) return; // already seeded

    const items = DEFAULT_SERVICES.map((s, i) =>
      this.repo.create({ ...s, facilityId, sortOrder: i }),
    );
    await this.repo.save(items);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async create(
    dto: CreateServiceCatalogDto,
    facilityId: string,
  ): Promise<ServiceCatalogItem> {
    const existing = await this.repo.findOne({
      where: { facilityId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `A service named "${dto.name}" already exists in your catalog`,
      );
    }
    const item = this.repo.create({ ...dto, facilityId });
    return this.repo.save(item);
  }

  async findAll(
    facilityId: string,
    activeOnly = true,
  ): Promise<ServiceCatalogItem[]> {
    const where: any = { facilityId };
    if (activeOnly) where.isActive = true;
    return this.repo.find({
      where,
      order: { category: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string, facilityId: string): Promise<ServiceCatalogItem> {
    const item = await this.repo.findOne({ where: { id, facilityId } });
    if (!item) throw new NotFoundException(`Service ${id} not found`);
    return item;
  }

  async update(
    id: string,
    dto: UpdateServiceCatalogDto,
    facilityId: string,
  ): Promise<ServiceCatalogItem> {
    const item = await this.findOne(id, facilityId);
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: string, facilityId: string): Promise<void> {
    const item = await this.findOne(id, facilityId);
    await this.repo.remove(item);
  }

  // ── Bulk reorder ──────────────────────────────────────────────────────────
  async reorder(
    items: { id: string; sortOrder: number }[],
    facilityId: string,
  ): Promise<void> {
    for (const { id, sortOrder } of items) {
      await this.repo.update({ id, facilityId }, { sortOrder });
    }
  }
}