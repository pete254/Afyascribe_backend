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
    // Prevent duplicate active visits for same patient
    const existing = await this.visitsRepository.findOne({
      where: {
        patientId: dto.patientId,
        facilityId,
      },
    });

    if (existing && ![VisitStatus.COMPLETED, VisitStatus.CANCELLED].includes(existing.status)) {
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
      status: VisitStatus.WAITING_FOR_DOCTOR,
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
  // FIX: Include CHECKED_IN so patients are visible to the doctor from the
  // moment they are assigned, regardless of billing status. Previously only
  // WAITING_FOR_DOCTOR / WITH_DOCTOR / TRIAGE were included, which meant
  // patients disappeared after triage completed (triage → WAITING_FOR_DOCTOR
  // works fine) but newly checked-in patients with unpaid bills (still
  // CHECKED_IN) were never shown. Including CHECKED_IN fixes both cases.
  async getDoctorQueue(doctorId: string, facilityId: string): Promise<PatientVisit[]> {
    return this.visitsRepository
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.patient', 'patient')
      .leftJoinAndSelect('visit.checkedInBy', 'checkedInBy')
      .leftJoinAndSelect('visit.triagedBy', 'triagedBy')
      .where('visit.assignedDoctorId = :doctorId', { doctorId })
      .andWhere('visit.facilityId = :facilityId', { facilityId })
      .andWhere('visit.status IN (:...statuses)', {
        statuses: [
          VisitStatus.CHECKED_IN,          // awaiting billing clearance
          VisitStatus.TRIAGE,              // nurse recording vitals
          VisitStatus.WAITING_FOR_DOCTOR,  // ready for the doctor
          VisitStatus.WITH_DOCTOR,         // currently in consultation
        ],
      })
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
    // Only advance to WAITING_FOR_DOCTOR if billing has been cleared
    // (i.e. visit is already WAITING_FOR_DOCTOR or beyond).
    // If still CHECKED_IN (unpaid cash bill), keep it there so the
    // billing gate still applies.
    if (visit.status === VisitStatus.CHECKED_IN) {
      // Stay CHECKED_IN — billing service will advance it when paid
      visit.status = VisitStatus.CHECKED_IN;
    } else {
      visit.status = VisitStatus.WAITING_FOR_DOCTOR;
    }

    return this.visitsRepository.save(visit);
  }

  // ── REASSIGN DOCTOR (receptionist / facility_admin only) ───────────────────
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

  // ── MARK AS WITH DOCTOR (when doctor opens the visit) ─────────────────────
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

  // ── CANCEL VISIT ───────────────────────────────────────────────────────────
  async cancel(visitId: string, facilityId: string): Promise<PatientVisit> {
    const visit = await this.findOne(visitId, facilityId);

    if (visit.status === VisitStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed visit');
    }

    visit.status = VisitStatus.CANCELLED;
    return this.visitsRepository.save(visit);
  }

  // ── GET STATS (for home screen counters) ──────────────────────────────────
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
      myQueue = await base
        .clone()
        .andWhere('visit.assignedDoctorId = :doctorId', { doctorId })
        .andWhere('visit.status IN (:...statuses)', {
          statuses: [
            VisitStatus.CHECKED_IN,
            VisitStatus.TRIAGE,
            VisitStatus.WAITING_FOR_DOCTOR,
            VisitStatus.WITH_DOCTOR,
          ],
        })
        .getCount();
    }

    return { checkedIn, waitingForDoctor, withDoctor, myQueue };
  }
}