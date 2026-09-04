import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Radiology } from './entities/radiology.entity';
import { CreateRadiologyDto } from './dto/create-radiology.dto';
import { UpdateRadiologyDto } from './dto/update-radiology.dto';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { RadiologyType } from './radiology-type.enum';

@Injectable()
export class RadiologyService {
  constructor(
    @InjectRepository(Radiology)
    private radiologyRepo: Repository<Radiology>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Facility)
    private facilityRepo: Repository<Facility>,
  ) {}

  async create(dto: CreateRadiologyDto) {
    const patient = await this.patientRepo.findOneBy({ id: dto.patientId });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilityRepo.findOneBy({ id: dto.facilityId });
    if (!facility) throw new NotFoundException('Facility not found');

    const r = this.radiologyRepo.create({
      type: dto.type as RadiologyType,
      patient,
      facility,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      notes: dto.notes,
    });
    return this.radiologyRepo.save(r);
  }

  findAll() {
    return this.radiologyRepo.find();
  }

  async findOne(id: string) {
    const r = await this.radiologyRepo.findOneBy({ id });
    if (!r) throw new NotFoundException('Radiology not found');
    return r;
  }

  async update(id: string, dto: UpdateRadiologyDto) {
    const r = await this.findOne(id);
    Object.assign(r, {
      ...(dto.type && { type: dto.type as RadiologyType }),
      ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.status && { status: dto.status }),
      ...(dto.notes && { notes: dto.notes }),
      ...(dto.report && { report: dto.report }),
    });
    return this.radiologyRepo.save(r);
  }

  async remove(id: string) {
    const r = await this.findOne(id);
    return this.radiologyRepo.remove(r);
  }
}
