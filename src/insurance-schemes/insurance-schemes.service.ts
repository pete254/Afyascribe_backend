import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsuranceScheme } from './entities/insurance-scheme.entity';
import { CreateInsuranceSchemeDto, UpdateInsuranceSchemeDto } from './dto/insurance-scheme.dto';

@Injectable()
export class InsuranceSchemesService {
  constructor(
    @InjectRepository(InsuranceScheme)
    private readonly repo: Repository<InsuranceScheme>,
  ) {}

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