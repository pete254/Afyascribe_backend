// src/facilities/facilities.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facility, FacilityStatus } from './entities/facility.entity';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

@Injectable()
export class FacilitiesService {
  constructor(
    @InjectRepository(Facility)
    private readonly facilityRepository: Repository<Facility>,
  ) {}

  /**
   * Create a new facility. Code must be unique.
   */
  async create(dto: CreateFacilityDto): Promise<Facility> {
    // Normalize code to uppercase
    const code = dto.code.toUpperCase().trim();

    const existing = await this.facilityRepository.findOne({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(
        `A facility with code "${code}" already exists`,
      );
    }

    const facility = this.facilityRepository.create({ ...dto, code });
    return this.facilityRepository.save(facility);
  }

  /**
   * Get all facilities (super_admin only)
   */
  async findAll(): Promise<Facility[]> {
    return this.facilityRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Get a single facility by UUID
   */
  async findOne(id: string): Promise<Facility> {
    const facility = await this.facilityRepository.findOne({ where: { id } });
    if (!facility) {
      throw new NotFoundException(`Facility with ID "${id}" not found`);
    }
    return facility;
  }

  /**
   * Get a facility by its short code (e.g. "KNH")
   */
  async findByCode(code: string): Promise<Facility> {
    const facility = await this.facilityRepository.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!facility) {
      throw new NotFoundException(`Facility with code "${code}" not found`);
    }
    return facility;
  }

  /**
   * Update a facility
   */
  async update(id: string, dto: UpdateFacilityDto): Promise<Facility> {
    const facility = await this.findOne(id);

    // If code is being changed, check uniqueness
    if (dto.code && dto.code.toUpperCase() !== facility.code) {
      const codeConflict = await this.facilityRepository.findOne({
        where: { code: dto.code.toUpperCase() },
      });
      if (codeConflict) {
        throw new ConflictException(
          `A facility with code "${dto.code.toUpperCase()}" already exists`,
        );
      }
      dto.code = dto.code.toUpperCase();
    }

    Object.assign(facility, dto);
    return this.facilityRepository.save(facility);
  }

  /**
   * Soft-deactivate a facility (sets status to INACTIVE)
   */
  async deactivate(id: string): Promise<Facility> {
    const facility = await this.findOne(id);
    facility.status = FacilityStatus.INACTIVE;
    facility.isActive = false;
    return this.facilityRepository.save(facility);
  }

  /**
   * Get summary stats for a facility
   */
  async getStats(id: string): Promise<{
    facility: Facility;
    userCount: number;
    patientCount: number;
  }> {
    const facility = await this.facilityRepository.findOne({
      where: { id },
      relations: ['users', 'patients'],
    });

    if (!facility) {
      throw new NotFoundException(`Facility with ID "${id}" not found`);
    }

    return {
      facility,
      userCount: facility.users?.length ?? 0,
      patientCount: facility.patients?.length ?? 0,
    };
  }

  /**
   * Verify a facilityId exists and is active — used by guards
   */
  async validateFacility(id: string): Promise<boolean> {
    const facility = await this.facilityRepository.findOne({
      where: { id, isActive: true },
    });
    return !!facility;
  }
}