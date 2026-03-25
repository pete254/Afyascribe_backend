// src/patient-visits/patient-visits.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientVisit, VisitStatus } from './entities/patient-visit.entity';
import { CheckInDto } from './dto/check-in.dto';
import { TriageDto } from './dto/triage.dto';
import { ReassignDto } from './dto/reassign.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';

// All statuses that mean a patient is still actively in the doctor's queue
const ACTIVE_DOCTOR_STATUSES = [
  VisitStatus.CHECKED_IN,
  VisitStatus.TRIAGE,
  VisitStatus.WAITING_FOR_DOCTOR,
  VisitStatus.WITH_DOCTOR,
];

@Injectable()
export class PatientVisitsService {
  constructor(
    @InjectRepository(PatientVisit)
    private readonly visitsRepository: Repository<PatientVisit>,
  ) {}

  // ── CHECK IN ───────────────────────────────────────────────────────────────
  async checkIn(
    dto: CheckInDto,
    checkedInById: string,
    facilityId: string,
  ): Promise<PatientVisit> {
    const existing = await this.visitsRepository.findOne({
      where: { patientId: dto.patientId, facilityId },
    });

    if (existing && !([VisitStatus.COMPLETED, VisitStatus.CANCELLED] as string[]).includes(existing.status)) {
      throw new BadRequestException(
        'This patient already has an active visit. Complete or cancel it first.',
      );
    }

    const visit = this.visitsRepository.create({
      patientId: dto.patientId,
      facilityId,
      reasonForVisit: dto.reasonForVisit,
      assignedDoctorId: dto.assignedDoctorId,
      checkedInById,
      checkedInAt: new Date(),
      status: VisitStatus.CHECKED_IN,
    });

    return this.visitsRepository.save(visit);
  }

  // ── GET ALL VISITS (facility-scoped, filterable) ───────────────────────────
  async findAll(facilityId: string, query: QueryVisitsDto): Promise<PatientVisit[]> {
    const qb = this.visitsRepository
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.patient', 'patient')
      .leftJoinAndSelect('visit.assignedDoctor', 'assignedDoctor')
      .leftJoinAndSelect('visit.checkedInBy', 'checkedInBy')
      .leftJoinAndSelect('visit.triagedBy', 'triagedBy')
      .where('visit.facilityId = :facilityId', { facilityId })
      .orderBy('visit.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('visit.status = :status', { status: query.status });
    }

    if (query.doctorId) {
      qb.andWhere('visit.assignedDoctorId = :doctorId', { doctorId: query.doctorId });
    }

    return qb.getMany();
  }

  // ── GET TODAY'S ACTIVE QUEUE ───────────────────────────────────────────────
  async getActiveQueue(facilityId: string): Promise<PatientVisit[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.visitsRepository
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.patient', 'patient')
      .leftJoinAndSelect('visit.assignedDoctor', 'assignedDoctor')
      .leftJoinAndSelect('visit.checkedInBy', 'checkedInBy')
      .leftJoinAndSelect('visit.triagedBy', 'triagedBy')
      .where('visit.facilityId = :facilityId', { facilityId })
      .andWhere('visit.created_at >= :today', { today })
      .andWhere('visit.status NOT IN (:...statuses)', {
        statuses: [VisitStatus.COMPLETED, VisitStatus.CANCELLED],
      })
      .orderBy('visit.created_at', 'ASC')
      .getMany();
  }

  // ── GET DOCTOR'S QUEUE ─────────────────────────────────────────────────────
  async getDoctorQueue(doctorId: string, facilityId: string): Promise<PatientVisit[]> {
    return this.visitsRepository
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.patient', 'patient')
      .leftJoinAndSelect('visit.checkedInBy', 'checkedInBy')
      .leftJoinAndSelect('visit.triagedBy', 'triagedBy')
      .where('visit.assignedDoctorId = :doctorId', { doctorId })
      .andWhere('visit.facilityId = :facilityId', { facilityId })
      .andWhere('visit.status IN (:...statuses)', { statuses: ACTIVE_DOCTOR_STATUSES })
      .orderBy('visit.created_at', 'ASC')
      .getMany();
  }

  // ── GET SINGLE VISIT ───────────────────────────────────────────────────────
  async findOne(id: string, facilityId: string): Promise<PatientVisit> {
    const visit = await this.visitsRepository.findOne({
      where: { id, facilityId },
      relations: ['patient', 'assignedDoctor', 'checkedInBy', 'triagedBy'],
    });

    if (!visit) throw new NotFoundException(`Visit ${id} not found`);
    return visit;
  }

  // ── SUBMIT TRIAGE ──────────────────────────────────────────────────────────
  async submitTriage(
    visitId: string,
    dto: TriageDto,
    triagedById: string,
    facilityId: string,
  ): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);

    if (visit.status === VisitStatus.COMPLETED || visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException('Cannot triage a completed or cancelled visit');
    }

    visit.triageData = { ...dto };
    visit.triageCompleted = true;
    visit.triagedById = triagedById;
    visit.triagedAt = new Date();

    // Only advance to WAITING_FOR_DOCTOR if billing has been cleared.
    // If still CHECKED_IN (unpaid cash bill), keep it — billing service
    // will advance it when payment is collected.
    if (visit.status !== VisitStatus.CHECKED_IN) {
      visit.status = VisitStatus.WAITING_FOR_DOCTOR;
    }

    return this.visitsRepository.save(visit);
  }

  // ── REASSIGN DOCTOR ────────────────────────────────────────────────────────
  async reassign(
    visitId: string,
    dto: ReassignDto,
    facilityId: string,
  ): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);

    if (visit.status === VisitStatus.COMPLETED || visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException('Cannot reassign a completed or cancelled visit');
    }

    visit.assignedDoctorId = dto.assignedDoctorId;
    return this.visitsRepository.save(visit);
  }

  // ── MARK AS WITH DOCTOR ────────────────────────────────────────────────────
  async markWithDoctor(visitId: string, doctorId: string, facilityId: string): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);

    if (visit.assignedDoctorId !== doctorId) {
      throw new ForbiddenException('This patient is not assigned to you');
    }

    if (visit.status === VisitStatus.WAITING_FOR_DOCTOR) {
      visit.status = VisitStatus.WITH_DOCTOR;
      return this.visitsRepository.save(visit);
    }

    return visit;
  }

  // ── COMPLETE VISIT ─────────────────────────────────────────────────────────
  async complete(visitId: string, facilityId: string): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);
    visit.status = VisitStatus.COMPLETED;
    return this.visitsRepository.save(visit);
  }

  // ── AUTO-COMPLETE VISIT WHEN SOAP NOTE IS SAVED ────────────────────────────
  // Finds today's active visit for the patient and marks it completed.
  // Silently does nothing if no active visit exists (doctor wrote note
  // outside of a queued visit — perfectly valid).
  async completeVisitForPatient(patientId: string, facilityId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visit = await this.visitsRepository
      .createQueryBuilder('visit')
      .where('visit.patientId = :patientId', { patientId })
      .andWhere('visit.facilityId = :facilityId', { facilityId })
      .andWhere('visit.status IN (:...statuses)', { statuses: ACTIVE_DOCTOR_STATUSES })
      .orderBy('visit.created_at', 'DESC')
      .getOne();

    if (visit) {
      visit.status = VisitStatus.COMPLETED;
      await this.visitsRepository.save(visit);
      console.log(`✅ Visit ${visit.id} auto-completed after SOAP note saved for patient ${patientId}`);
    }
  }

  // ── CANCEL VISIT ───────────────────────────────────────────────────────────
  async cancel(visitId: string, facilityId: string): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);

    if (visit.status === VisitStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed visit');
    }

    visit.status = VisitStatus.CANCELLED;
    return this.visitsRepository.save(visit);
  }

  // ── GET STATS ──────────────────────────────────────────────────────────────
  async getQueueStats(facilityId: string, doctorId?: string): Promise<{
    checkedIn: number;
    waitingForDoctor: number;
    withDoctor: number;
    myQueue?: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const base = this.visitsRepository
      .createQueryBuilder('visit')
      .where('visit.facilityId = :facilityId', { facilityId })
      .andWhere('visit.created_at >= :today', { today });

    const [checkedIn, waitingForDoctor, withDoctor] = await Promise.all([
      base.clone().andWhere('visit.status = :s', { s: VisitStatus.CHECKED_IN }).getCount(),
      base.clone().andWhere('visit.status = :s', { s: VisitStatus.WAITING_FOR_DOCTOR }).getCount(),
      base.clone().andWhere('visit.status = :s', { s: VisitStatus.WITH_DOCTOR }).getCount(),
    ]);

    let myQueue: number | undefined;
    if (doctorId) {
      // Count ALL active statuses so the badge always matches what the
      // doctor sees in their queue screen
      myQueue = await this.visitsRepository
        .createQueryBuilder('visit')
        .where('visit.facilityId = :facilityId', { facilityId })
        .andWhere('visit.assignedDoctorId = :doctorId', { doctorId })
        .andWhere('visit.status IN (:...statuses)', { statuses: ACTIVE_DOCTOR_STATUSES })
        .getCount();
    }

    return { checkedIn, waitingForDoctor, withDoctor, myQueue };
  }
}