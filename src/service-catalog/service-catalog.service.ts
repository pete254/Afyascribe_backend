// src/service-catalog/service-catalog.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
  constructor(
    @InjectRepository(ServiceCatalogItem)
    private readonly repo: Repository<ServiceCatalogItem>,
  ) {}

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