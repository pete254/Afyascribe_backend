import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsuranceScheme } from './entities/insurance-scheme.entity';
import { CreateInsuranceSchemeDto, UpdateInsuranceSchemeDto } from './dto/insurance-scheme.dto';
import { KENYA_INSURERS } from './data/kenya-insurers';

@Injectable()
export class InsuranceSchemesService {
  constructor(
    @InjectRepository(InsuranceScheme)
    private readonly repo: Repository<InsuranceScheme>,
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
}