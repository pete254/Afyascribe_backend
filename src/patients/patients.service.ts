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
  /**
   * Reduce a phone number to its national significant digits so different
   * formats compare equal: +254712345678 / 254712345678 / 0712345678 all
   * become 712345678.
   */
  private normalizeKePhone(raw: string): string {
    return (raw ?? '').replace(/\D/g, '').replace(/^(254|0)/, '');
  }

  async searchPatients(query: string, facilityId: string): Promise<Patient[]> {
    const trimmed = (query ?? '').trim();
    if (trimmed.length < 2) return [];

    // Split into words; every word must match at least one identifying field, so
    // names can be typed in any order (surname first is fine) and a name can be
    // combined with a phone or patient number. A single word matches on its own.
    const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, 6);
    const fields = [
      'patient.firstName',
      'patient.middleName',
      'patient.lastName',
      'patient.patientId',
      'patient.idNumber',
      'patient.phoneNumber',
    ];
    // The stored phone reduced to national significant digits, so a query in any
    // format matches a number stored in any format.
    const normalizedPhoneExpr = `regexp_replace(regexp_replace(patient.phoneNumber, '\\D', '', 'g'), '^(254|0)', '')`;

    const qb = this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.facilityId = :facilityId', { facilityId });

    tokens.forEach((token, i) => {
      const param = `t${i}`;
      const params: Record<string, string> = { [param]: `%${token}%` };
      const ors = fields.map((f) => `${f} ILIKE :${param}`);

      // If the word looks like a phone, also match on the normalized number.
      const normPhone = this.normalizeKePhone(token);
      if (normPhone.length >= 3) {
        const pparam = `ph${i}`;
        ors.push(`${normalizedPhoneExpr} ILIKE :${pparam}`);
        params[pparam] = `%${normPhone}%`;
      }

      qb.andWhere(`(${ors.join(' OR ')})`, params);
    });

    return qb
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
    // Match on the normalized number so any format of the query finds a number
    // stored in any format; fall back to raw contains for non-standard entries.
    const normalizedPhoneExpr = `regexp_replace(regexp_replace(patient.phoneNumber, '\\D', '', 'g'), '^(254|0)', '')`;
    const norm = this.normalizeKePhone(phone);
    return this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.facilityId = :facilityId', { facilityId })
      .andWhere(`(patient.phoneNumber ILIKE :raw OR ${normalizedPhoneExpr} ILIKE :norm)`, {
        raw: `%${phone.trim()}%`,
        norm: `%${norm || phone.trim()}%`,
      })
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