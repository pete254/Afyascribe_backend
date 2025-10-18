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
   * Get recently registered patients (last 14 days)
   */
  async getRecentPatients(limit: number = 10): Promise<Patient[]> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const patients = await this.patientRepository.find({
      where: {
        registeredAt: MoreThanOrEqual(fourteenDaysAgo),
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
   * SEED METHOD - Create dummy Kenyan patients for testing
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
        patientId: 'P-2025-011',
        firstName: 'Wanjiru',
        lastName: 'Kamau',
        age: 34,
        gender: 'female',
        phoneNumber: '+254712345678',
        email: 'wanjiru.kamau@gmail.com',
      },
      {
        patientId: 'P-2025-012',
        firstName: 'Ochieng',
        lastName: 'Otieno',
        age: 45,
        gender: 'male',
        phoneNumber: '+254723456789',
        email: 'ochieng.otieno@yahoo.com',
      },
      {
        patientId: 'P-2025-013',
        firstName: 'Njeri',
        lastName: 'Mwangi',
        age: 28,
        gender: 'female',
        phoneNumber: '+254734567890',
        email: 'njeri.mwangi@outlook.com',
      },
      {
        patientId: 'P-2025-014',
        firstName: 'Kipchoge',
        lastName: 'Koech',
        age: 52,
        gender: 'male',
        phoneNumber: '+254745678901',
        email: 'kipchoge.koech@gmail.com',
      },
      {
        patientId: 'P-2025-015',
        firstName: 'Akinyi',
        lastName: 'Odhiambo',
        age: 39,
        gender: 'female',
        phoneNumber: '+254756789012',
        email: 'akinyi.odhiambo@yahoo.com',
      },
      {
        patientId: 'P-2025-016',
        firstName: 'Kamau',
        lastName: 'Ngugi',
        age: 61,
        gender: 'male',
        phoneNumber: '+254767890123',
        email: 'kamau.ngugi@gmail.com',
      },
      {
        patientId: 'P-2025-017',
        firstName: 'Chebet',
        lastName: 'Kiplagat',
        age: 31,
        gender: 'female',
        phoneNumber: '+254778901234',
        email: 'chebet.kiplagat@outlook.com',
      },
      {
        patientId: 'P-2025-018',
        firstName: 'Mwangi',
        lastName: 'Kariuki',
        age: 47,
        gender: 'male',
        phoneNumber: '+254789012345',
        email: 'mwangi.kariuki@gmail.com',
      },
      {
        patientId: 'P-2025-019',
        firstName: 'Nyambura',
        lastName: 'Wachira',
        age: 26,
        gender: 'female',
        phoneNumber: '+254790123456',
        email: 'nyambura.wachira@yahoo.com',
      },
      {
        patientId: 'P-2025-020',
        firstName: 'Onyango',
        lastName: 'Okoth',
        age: 55,
        gender: 'male',
        phoneNumber: '+254701234567',
        email: 'onyango.okoth@gmail.com',
      },
      {
        patientId: 'P-2025-021',
        firstName: 'Wambui',
        lastName: 'Ndung\'u',
        age: 42,
        gender: 'female',
        phoneNumber: '+254712345670',
        email: 'wambui.ndungu@outlook.com',
      },
      {
        patientId: 'P-2025-022',
        firstName: 'Kiprop',
        lastName: 'Biwott',
        age: 38,
        gender: 'male',
        phoneNumber: '+254723456780',
        email: 'kiprop.biwott@gmail.com',
      },
      {
        patientId: 'P-2025-023',
        firstName: 'Auma',
        lastName: 'Adhiambo',
        age: 50,
        gender: 'female',
        phoneNumber: '+254734567801',
        email: 'auma.adhiambo@yahoo.com',
      },
      {
        patientId: 'P-2025-024',
        firstName: 'Kimani',
        lastName: 'Njoroge',
        age: 29,
        gender: 'male',
        phoneNumber: '+254745678012',
        email: 'kimani.njoroge@gmail.com',
      },
      {
        patientId: 'P-2025-025',
        firstName: 'Mumbi',
        lastName: 'Githinji',
        age: 36,
        gender: 'female',
        phoneNumber: '+254756789023',
        email: 'mumbi.githinji@outlook.com',
      },
      {
        patientId: 'P-2025-026',
        firstName: 'Rotich',
        lastName: 'Kibet',
        age: 44,
        gender: 'male',
        phoneNumber: '+254767890134',
        email: 'rotich.kibet@gmail.com',
      },
      {
        patientId: 'P-2025-027',
        firstName: 'Kerubo',
        lastName: 'Nyaboke',
        age: 33,
        gender: 'female',
        phoneNumber: '+254778901245',
        email: 'kerubo.nyaboke@yahoo.com',
      },
      {
        patientId: 'P-2025-028',
        firstName: 'Mutua',
        lastName: 'Musyoka',
        age: 58,
        gender: 'male',
        phoneNumber: '+254789012356',
        email: 'mutua.musyoka@gmail.com',
      },
      {
        patientId: 'P-2025-029',
        firstName: 'Wairimu',
        lastName: 'Maina',
        age: 25,
        gender: 'female',
        phoneNumber: '+254790123467',
        email: 'wairimu.maina@outlook.com',
      },
      {
        patientId: 'P-2025-030',
        firstName: 'Omondi',
        lastName: 'Owino',
        age: 48,
        gender: 'male',
        phoneNumber: '+254701234578',
        email: 'omondi.owino@gmail.com',
      },
    ];

    const patients = await this.patientRepository.save(dummyPatients);
    console.log(`✅ Seeded ${patients.length} Kenyan dummy patients`);
    return patients;
  }
}