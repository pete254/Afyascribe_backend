// src/patients/patients.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual } from 'typeorm';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {}

  /**
   * Search patients by name or patient ID
   */
  async searchPatients(query: string): Promise<Patient[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    const patients = await this.patientRepository
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

    return patients;
  }

  /**
   * Get recently registered patients (last 7 days)
   */
  async getRecentPatients(limit: number = 10): Promise<Patient[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const patients = await this.patientRepository.find({
      where: {
        registeredAt: MoreThanOrEqual(sevenDaysAgo),
      },
      order: {
        registeredAt: 'DESC',
      },
      take: limit,
    });

    return patients;
  }

  /**
   * Get all patients with pagination
   */
  async getAllPatients(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Patient[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [patients, total] = await this.patientRepository.findAndCount({
      order: {
        lastName: 'ASC',
        firstName: 'ASC',
      },
      skip,
      take: limit,
    });

    return {
      data: patients,
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single patient by ID
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
   * Get a single patient by hospital patient ID
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
   * Check if patient exists by ID
   */
  async patientExists(id: string): Promise<boolean> {
    const count = await this.patientRepository.count({ where: { id } });
    return count > 0;
  }

  /**
   * SEED METHOD - Create dummy patients for testing
   * This should only be used in development!
   */
  /**
 * SEED METHOD - Create dummy patients for testing
 * This should only be used in development!
 */
async seedDummyPatients(): Promise<Patient[]> {
  // Check if patients already exist
  const existingCount = await this.patientRepository.count();
  if (existingCount > 0) {
    console.log('Patients already exist in database. Skipping seed.');
    return [];
  }

  const dummyPatients = [
    {
      patientId: 'P-2024-001',
      firstName: 'John',
      lastName: 'Doe',
      age: 45,  // EXPLICIT AGE
      gender: 'male',
      phoneNumber: '+1234567890',
      email: 'john.doe@example.com',
    },
    {
      patientId: 'P-2024-002',
      firstName: 'Jane',
      lastName: 'Smith',
      age: 32,  // EXPLICIT AGE
      gender: 'female',
      phoneNumber: '+1234567891',
      email: 'jane.smith@example.com',
    },
    {
      patientId: 'P-2024-003',
      firstName: 'Mary',
      lastName: 'Johnson',
      age: 58,  // EXPLICIT AGE
      gender: 'female',
      phoneNumber: '+1234567892',
      email: 'mary.johnson@example.com',
    },
    {
      patientId: 'P-2024-004',
      firstName: 'Robert',
      lastName: 'Brown',
      age: 28,  // EXPLICIT AGE
      gender: 'male',
      phoneNumber: '+1234567893',
      email: 'robert.brown@example.com',
    },
    {
      patientId: 'P-2024-005',
      firstName: 'Patricia',
      lastName: 'Davis',
      age: 39,  // EXPLICIT AGE
      gender: 'female',
      phoneNumber: '+1234567894',
      email: 'patricia.davis@example.com',
    },
    {
      patientId: 'P-2024-006',
      firstName: 'Michael',
      lastName: 'Wilson',
      age: 52,  // EXPLICIT AGE
      gender: 'male',
      phoneNumber: '+1234567895',
      email: 'michael.wilson@example.com',
    },
    {
      patientId: 'P-2024-007',
      firstName: 'Linda',
      lastName: 'Martinez',
      age: 35,  // EXPLICIT AGE
      gender: 'female',
      phoneNumber: '+1234567896',
      email: 'linda.martinez@example.com',
    },
    {
      patientId: 'P-2024-008',
      firstName: 'David',
      lastName: 'Anderson',
      age: 64,  // EXPLICIT AGE
      gender: 'male',
      phoneNumber: '+1234567897',
      email: 'david.anderson@example.com',
    },
    {
      patientId: 'P-2024-009',
      firstName: 'Barbara',
      lastName: 'Taylor',
      age: 46,  // EXPLICIT AGE
      gender: 'female',
      phoneNumber: '+1234567898',
      email: 'barbara.taylor@example.com',
    },
    {
      patientId: 'P-2024-010',
      firstName: 'James',
      lastName: 'Thomas',
      age: 30,  // EXPLICIT AGE
      gender: 'male',
      phoneNumber: '+1234567899',
      email: 'james.thomas@example.com',
    },
  ];

  const patients = await this.patientRepository.save(dummyPatients);
  console.log(`Seeded ${patients.length} dummy patients`);
  return patients;
}
}