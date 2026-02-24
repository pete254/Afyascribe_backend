// src/patients/patients.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {}

  /**
   * Auto-generate a unique patient ID in the format AFY/YYYY/NNNNN
   */
  private async generatePatientId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `AFY/${year}/`;

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
   * Create a new patient — patientId is auto-generated
   */
  async createPatient(dto: any): Promise<Patient> {
    const patientId = await this.generatePatientId();

    // Auto-calculate age from dateOfBirth if provided
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
    });
    return this.patientRepository.save(patient);
  }

  /**
   * Search patients by name or patient ID
   */
  async searchPatients(query: string): Promise<Patient[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    return this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.firstName ILIKE :searchTerm', { searchTerm })
      .orWhere('patient.lastName ILIKE :searchTerm', { searchTerm })
      .orWhere('patient.patientId ILIKE :searchTerm', { searchTerm })
      .orWhere(
        "CONCAT(patient.firstName, ' ', patient.lastName) ILIKE :searchTerm",
        { searchTerm },
      )
      .orderBy('patient.lastName', 'ASC')
      .addOrderBy('patient.firstName', 'ASC')
      .limit(20)
      .getMany();
  }

  /**
   * Get recently registered patients
   */
  async getRecentPatients(limit: number = 10): Promise<Patient[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);

    return this.patientRepository.find({
      where: { registeredAt: MoreThanOrEqual(cutoff) },
      order: { registeredAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get all patients with pagination
   */
  async getAllPatients(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.patientRepository.findAndCount({
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Get a single patient by UUID
   */
  async getPatientById(id: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { id },
      relations: ['soapNotes'],
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  /**
   * Get a single patient by hospital patient ID (e.g. AFY/2026/00001)
   */
  async getPatientByPatientId(patientId: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { patientId },
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
   * Check if patient exists by UUID
   */
  async patientExists(id: string): Promise<boolean> {
    const count = await this.patientRepository.count({ where: { id } });
    return count > 0;
  }
}