// src/self-registration/self-registration.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { SelfRegistration, SelfRegStatus } from './entities/self-registration.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientsService } from '../patients/patients.service';
import { CreateSelfRegistrationDto } from './dto/self-registration.dto';

// No I/O/0/1 — these get read aloud and copied off a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SelfRegistrationService {
  constructor(
    @InjectRepository(SelfRegistration)
    private readonly repo: Repository<SelfRegistration>,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
    private readonly patientsService: PatientsService,
  ) {}

  private newCode(len = 6): string {
    let s = '';
    for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return s;
  }

  /** Public: what the patient sees before filling the form, so they know where they are. */
  async facilityByCode(code: string): Promise<{ code: string; name: string; logoUrl: string | null }> {
    const facility = await this.facilities.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!facility || !facility.isActive) throw new NotFoundException('Unknown facility');
    return { code: facility.code, name: facility.name, logoUrl: facility.logoUrl ?? null };
  }

  /**
   * Public: a patient pre-registers from their own phone. Returns only the code —
   * never an id or anything about the facility's records.
   */
  async create(dto: CreateSelfRegistrationDto): Promise<{ code: string; expiresAt: Date }> {
    const facility = await this.facilities.findOne({
      where: { code: dto.facilityCode.toUpperCase() },
    });
    if (!facility || !facility.isActive) throw new NotFoundException('Unknown facility');

    // Retry on the (vanishingly rare) code collision rather than 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.newCode();
      const existing = await this.repo.findOne({ where: { code } });
      if (existing) continue;

      const reg = this.repo.create({
        code,
        facilityId: facility.id,
        firstName: dto.firstName.trim(),
        middleName: dto.middleName?.trim(),
        lastName: dto.lastName.trim(),
        gender: dto.gender ?? 'unknown',
        dateOfBirth: dto.dateOfBirth,
        phoneNumber: dto.phoneNumber?.trim(),
        email: dto.email?.trim(),
        idNumber: dto.idNumber?.trim(),
        membershipNo: dto.membershipNo?.trim(),
        medicalPlan: dto.medicalPlan?.trim(),
        status: SelfRegStatus.PENDING,
        expiresAt: new Date(Date.now() + TTL_MS),
      });
      const saved = await this.repo.save(reg);
      return { code: saved.code, expiresAt: saved.expiresAt };
    }
    throw new BadRequestException('Could not allocate a registration code, please try again');
  }

  /** Staff: pending submissions for their own facility, newest first. */
  async list(facilityId: string, status?: SelfRegStatus): Promise<SelfRegistration[]> {
    return this.repo.find({
      where: { facilityId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** Staff: look up the code the patient is holding. Facility-scoped. */
  async getByCode(code: string, facilityId: string): Promise<SelfRegistration> {
    const reg = await this.repo.findOne({
      where: { code: code.toUpperCase(), facilityId },
    });
    if (!reg) throw new NotFoundException(`No registration found for code ${code}`);
    return reg;
  }

  /**
   * Staff: approve a submission into the patient register.
   *
   * If the ID number already belongs to a patient at this facility we link to
   * that record instead of creating a duplicate — a returning patient who
   * re-registers at the kiosk should not fork their history.
   */
  async approve(
    code: string,
    facilityId: string,
    facilityCode: string,
    reviewerId: string,
  ): Promise<{ patient: Patient; merged: boolean }> {
    const reg = await this.getByCode(code, facilityId);
    if (reg.status !== SelfRegStatus.PENDING) {
      throw new BadRequestException(`This registration is already ${reg.status}`);
    }
    if (reg.expiresAt < new Date()) {
      throw new BadRequestException('This registration has expired — please register again');
    }

    let patient: Patient | null = null;
    let merged = false;

    if (reg.idNumber) {
      patient = await this.patients.findOne({
        where: { idNumber: reg.idNumber, facilityId },
      });
      merged = !!patient;
    }

    if (!patient) {
      patient = await this.patientsService.createPatient(
        {
          firstName: reg.firstName,
          middleName: reg.middleName,
          lastName: reg.lastName,
          gender: reg.gender,
          dateOfBirth: reg.dateOfBirth,
          phoneNumber: reg.phoneNumber,
          email: reg.email,
          idNumber: reg.idNumber,
          idType: reg.idNumber ? 'national_id' : undefined,
          membershipNo: reg.membershipNo,
          medicalPlan: reg.medicalPlan,
          howKnown: 'self-registration',
        },
        facilityId,
        facilityCode,
      );
    }

    reg.status = SelfRegStatus.APPROVED;
    reg.patientId = patient.id;
    reg.merged = merged;
    reg.reviewedBy = reviewerId;
    reg.reviewedAt = new Date();
    await this.repo.save(reg);

    return { patient, merged };
  }

  async reject(code: string, facilityId: string, reviewerId: string): Promise<void> {
    const reg = await this.getByCode(code, facilityId);
    if (reg.status !== SelfRegStatus.PENDING) {
      throw new BadRequestException(`This registration is already ${reg.status}`);
    }
    reg.status = SelfRegStatus.REJECTED;
    reg.reviewedBy = reviewerId;
    reg.reviewedAt = new Date();
    await this.repo.save(reg);
  }
}
