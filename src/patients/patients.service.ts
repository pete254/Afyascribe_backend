// src/patients/patients.service.ts
// UPDATED: All queries are now scoped to facilityId.
// Patient IDs now use facility code as prefix: KNH/2026/00042
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {}

  /**
   * Auto-generate a unique patient ID scoped to the facility.
   * Format: {FACILITY_CODE}/{YEAR}/{NNNNN}
   * e.g. KNH/2026/00042
   */
  private async generatePatientId(facilityCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const code = facilityCode.toUpperCase();
    const prefix = `${code}/${year}/`;

    const latest = await this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.patientId LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('patient.patientId', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (latest) {
      const parts = latest.patientId.split('/');
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }

    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  /**
   * Create a new patient — always scoped to the calling user's facility.
   */
  async createPatient(
    dto: any,
    facilityId: string,
    facilityCode: string,
  ): Promise<Patient> {
    const patientId = await this.generatePatientId(facilityCode);

    let age: number | undefined;
    if (dto.dateOfBirth) {
      const dob = new Date(dto.dateOfBirth);
      const today = new Date();
      age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    }

    const patient = this.patientRepository.create({
      ...(dto as Partial<Patient>),
      patientId,
      age,
      facilityId, // Scoped to facility
    });
    return this.patientRepository.save(patient);
  }

  /**
   * Search patients — scoped to facilityId.
   */
  async searchPatients(query: string, facilityId: string): Promise<Patient[]> {
    if (!query || query.trim().length < 2) return [];

    const searchTerm = `%${query.trim()}%`;

    return this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.facilityId = :facilityId', { facilityId })
      .andWhere(
        `(
          patient.firstName ILIKE :searchTerm OR
          patient.lastName ILIKE :searchTerm OR
          patient.patientId ILIKE :searchTerm OR
          CONCAT(patient.firstName, ' ', patient.lastName) ILIKE :searchTerm
        )`,
        { searchTerm },
      )
      .orderBy('patient.lastName', 'ASC')
      .addOrderBy('patient.firstName', 'ASC')
      .limit(20)
      .getMany();
  }

  /**
   * Get recently registered patients — scoped to facilityId.
   */
  async getRecentPatients(
    facilityId: string,
    limit: number = 10,
  ): Promise<Patient[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);

    return this.patientRepository.find({
      where: {
        facilityId,
        registeredAt: MoreThanOrEqual(cutoff),
      },
      order: { registeredAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get all patients paginated — scoped to facilityId.
   */
  async getAllPatients(
    facilityId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.patientRepository.findAndCount({
      where: { facilityId },
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Get a single patient by UUID — verifies it belongs to the facility.
   */
  async getPatientById(id: string, facilityId: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { id, facilityId },
      relations: ['soapNotes'],
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  /**
   * Get a patient by hospital patientId — scoped to facility.
   */
  async getPatientByPatientId(
    patientId: string,
    facilityId: string,
  ): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { patientId, facilityId },
      relations: ['soapNotes'],
    });

    if (!patient) {
      throw new NotFoundException(
        `Patient with Patient ID ${patientId} not found`,
      );
    }

    return patient;
  }

  /**
   * Update a patient — verifies facility ownership.
   */
  async updatePatient(
    id: string,
    updateData: UpdatePatientDto,
    facilityId: string,
  ): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { id, facilityId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID "${id}" not found`);
    }
    Object.assign(patient, updateData);
    return this.patientRepository.save(patient);
  }

  /**
   * Search patients by phone — scoped to facility.
   */
  async searchByPhone(phone: string, facilityId: string): Promise<Patient[]> {
    if (!phone || phone.trim().length < 3) return [];
    const searchTerm = `%${phone.trim()}%`;
    return this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.facilityId = :facilityId', { facilityId })
      .andWhere('patient.phoneNumber ILIKE :searchTerm', { searchTerm })
      .orderBy('patient.lastName', 'ASC')
      .addOrderBy('patient.firstName', 'ASC')
      .limit(20)
      .getMany();
  }

  /**
   * Check if patient exists in a facility.
   */
  async patientExists(id: string, facilityId?: string): Promise<boolean> {
    const where: any = { id };
    if (facilityId) where.facilityId = facilityId;
    const count = await this.patientRepository.count({ where });
    return count > 0;
  }
}