import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OpticalRx } from './entities/optical-rx.entity';
import { CreateOpticalDto } from './dto/create-optical.dto';
import { UpdateOpticalDto } from './dto/update-optical.dto';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { BillingService } from '../billing/billing.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { OpticalRxType, OpticalStatus } from './optical.enums';

const ACTIVE_VISIT_STATUSES = [
  VisitStatus.CHECKED_IN,
  VisitStatus.TRIAGE,
  VisitStatus.WAITING_FOR_DOCTOR,
  VisitStatus.WITH_DOCTOR,
];

// The plain string fields shared by create/update, mapped straight through.
const RX_FIELDS = [
  'sphereR', 'cylinderR', 'axisR', 'addR', 'vaR',
  'sphereL', 'cylinderL', 'axisL', 'addL', 'vaL',
  'pd', 'iop', 'complaint', 'findings', 'advice', 'frame', 'lensType',
] as const;

@Injectable()
export class OpticalService {
  constructor(
    @InjectRepository(OpticalRx)
    private opticalRepo: Repository<OpticalRx>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Facility)
    private facilityRepo: Repository<Facility>,
    @InjectRepository(PatientVisit)
    private visitRepo: Repository<PatientVisit>,
    private billing: BillingService,
  ) {}

  async create(facilityId: string, dto: CreateOpticalDto, userId?: string) {
    const patient = await this.patientRepo.findOneBy({ id: dto.patientId, facilityId });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilityRepo.findOneBy({ id: facilityId });
    if (!facility) throw new NotFoundException('Facility not found');

    const price = Number(dto.price) || 0;
    const visitId = await this.resolveVisit(facilityId, dto, price, userId);

    const rx = this.opticalRepo.create({
      patient,
      facility,
      visitId,
      rxType: (dto.rxType as OpticalRxType) ?? OpticalRxType.DISTANCE,
      status: OpticalStatus.EXAM,
      optometrist: userId ? ({ id: userId } as User) : undefined,
      price: price > 0 ? price.toFixed(2) : null,
    });
    for (const f of RX_FIELDS) {
      const v = dto[f];
      if (v !== undefined) (rx as unknown as Record<string, unknown>)[f] = v || null;
    }
    const saved = await this.opticalRepo.save(rx);

    if (price > 0 && visitId) {
      try {
        const desc = ['Optical', dto.frame, dto.lensType].filter(Boolean).join(' — ');
        const bill = await this.billing.create(
          { visitId, serviceType: ServiceType.PROCEDURE, serviceDescription: desc, amount: price },
          facilityId,
        );
        saved.billingId = bill.id;
        await this.opticalRepo.save(saved);
      } catch (e) {
        console.error(`Optical bill failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  private async resolveVisit(
    facilityId: string,
    dto: CreateOpticalDto,
    price: number,
    userId?: string,
  ): Promise<string | null> {
    if (dto.visitId) {
      const v = await this.visitRepo.findOne({ where: { id: dto.visitId, facilityId } });
      if (!v) throw new NotFoundException('Visit not found');
      return v.id;
    }
    if (price <= 0) return null;

    const active = await this.visitRepo.findOne({
      where: { facilityId, patientId: dto.patientId, status: In(ACTIVE_VISIT_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    if (active) return active.id;

    const anchor = await this.visitRepo.save(
      this.visitRepo.create({
        facilityId,
        patientId: dto.patientId,
        reasonForVisit: 'Optical dispensing',
        visitType: 'optical',
        status: VisitStatus.COMPLETED,
        checkedInById: userId ?? null,
        checkedInAt: new Date(),
      }),
    );
    return anchor.id;
  }

  findAll(facilityId: string, filter: { patientId?: string; status?: string } = {}) {
    return this.opticalRepo.find({
      where: {
        facility: { id: facilityId },
        ...(filter.patientId ? { patient: { id: filter.patientId } } : {}),
        ...(filter.status ? { status: filter.status as OpticalStatus } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(facilityId: string, id: string) {
    const rx = await this.opticalRepo.findOne({ where: { id, facility: { id: facilityId } } });
    if (!rx) throw new NotFoundException('Optical record not found');
    return rx;
  }

  async update(facilityId: string, id: string, dto: UpdateOpticalDto, userId?: string) {
    const rx = await this.findOne(facilityId, id);
    const nowCancelling = dto.status === OpticalStatus.CANCELLED && rx.status !== OpticalStatus.CANCELLED;

    if (dto.rxType) rx.rxType = dto.rxType as OpticalRxType;
    if (dto.status) rx.status = dto.status as OpticalStatus;
    for (const f of RX_FIELDS) {
      const v = dto[f];
      if (v !== undefined) (rx as unknown as Record<string, unknown>)[f] = v || null;
    }
    if (dto.status === OpticalStatus.DISPENSED && !rx.dispensedAt) rx.dispensedAt = new Date();
    if (userId) rx.optometrist = { id: userId } as User;

    const saved = await this.opticalRepo.save(rx);

    if (nowCancelling && saved.billingId && userId) {
      try {
        await this.billing.waive(saved.billingId, 'Optical order cancelled', userId, facilityId);
      } catch (e) {
        console.error(`Voiding optical bill ${saved.billingId} failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  async remove(facilityId: string, id: string) {
    const rx = await this.findOne(facilityId, id);
    return this.opticalRepo.remove(rx);
  }
}
