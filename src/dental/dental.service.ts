import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DentalTreatment } from './entities/dental-treatment.entity';
import { CreateDentalDto } from './dto/create-dental.dto';
import { UpdateDentalDto } from './dto/update-dental.dto';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { BillingService } from '../billing/billing.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { DentalProcedure, DentalStatus } from './dental.enums';

const ACTIVE_VISIT_STATUSES = [
  VisitStatus.CHECKED_IN,
  VisitStatus.TRIAGE,
  VisitStatus.WAITING_FOR_DOCTOR,
  VisitStatus.WITH_DOCTOR,
];

const procedureLabel = (p: string) =>
  ({
    EXAM: 'Examination', SCALING: 'Scaling & polishing', FILLING: 'Filling', EXTRACTION: 'Extraction',
    ROOT_CANAL: 'Root canal', CROWN: 'Crown', BRIDGE: 'Bridge', DENTURE: 'Denture', IMPLANT: 'Implant',
    WHITENING: 'Whitening', XRAY: 'Dental X-ray', OTHER: 'Dental procedure',
  }[p] ?? 'Dental procedure');

@Injectable()
export class DentalService {
  constructor(
    @InjectRepository(DentalTreatment)
    private dentalRepo: Repository<DentalTreatment>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Facility)
    private facilityRepo: Repository<Facility>,
    @InjectRepository(PatientVisit)
    private visitRepo: Repository<PatientVisit>,
    private billing: BillingService,
  ) {}

  async create(facilityId: string, dto: CreateDentalDto, userId?: string) {
    const patient = await this.patientRepo.findOneBy({ id: dto.patientId, facilityId });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilityRepo.findOneBy({ id: facilityId });
    if (!facility) throw new NotFoundException('Facility not found');

    const price = Number(dto.price) || 0;
    const visitId = await this.resolveVisit(facilityId, dto, price, userId);

    const t = this.dentalRepo.create({
      procedure: dto.procedure as DentalProcedure,
      tooth: dto.tooth ?? null,
      surfaces: dto.surfaces ?? null,
      patient,
      facility,
      requestedBy: userId ? ({ id: userId } as User) : undefined,
      findings: dto.findings ?? null,
      notes: dto.notes ?? null,
      status: (dto.status as DentalStatus) ?? DentalStatus.PLANNED,
      price: price > 0 ? price.toFixed(2) : null,
      visitId,
    });
    const saved = await this.dentalRepo.save(t);

    if (price > 0 && visitId) {
      try {
        const bill = await this.billing.create(
          {
            visitId,
            serviceType: ServiceType.PROCEDURE,
            serviceDescription: `Dental: ${procedureLabel(dto.procedure)}${dto.tooth ? ` (tooth ${dto.tooth})` : ''}`,
            amount: price,
          },
          facilityId,
        );
        saved.billingId = bill.id;
        await this.dentalRepo.save(saved);
      } catch (e) {
        console.error(`Dental bill for "${dto.procedure}" failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  /** Pick the visit a dental charge hangs on (only when a price is set). */
  private async resolveVisit(
    facilityId: string,
    dto: CreateDentalDto,
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
        reasonForVisit: `Dental: ${procedureLabel(dto.procedure)}`,
        visitType: 'dental',
        status: VisitStatus.COMPLETED,
        checkedInById: userId ?? null,
        checkedInAt: new Date(),
      }),
    );
    return anchor.id;
  }

  findAll(facilityId: string, filter: { patientId?: string; status?: string } = {}) {
    return this.dentalRepo.find({
      where: {
        facility: { id: facilityId },
        ...(filter.patientId ? { patient: { id: filter.patientId } } : {}),
        ...(filter.status ? { status: filter.status as DentalStatus } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(facilityId: string, id: string) {
    const t = await this.dentalRepo.findOne({ where: { id, facility: { id: facilityId } } });
    if (!t) throw new NotFoundException('Dental treatment not found');
    return t;
  }

  async update(facilityId: string, id: string, dto: UpdateDentalDto, userId?: string) {
    const t = await this.findOne(facilityId, id);
    const nowCancelling = dto.status === DentalStatus.CANCELLED && t.status !== DentalStatus.CANCELLED;

    Object.assign(t, {
      ...(dto.procedure && { procedure: dto.procedure as DentalProcedure }),
      ...(dto.tooth !== undefined && { tooth: dto.tooth || null }),
      ...(dto.surfaces !== undefined && { surfaces: dto.surfaces || null }),
      ...(dto.status && { status: dto.status as DentalStatus }),
      ...(dto.findings !== undefined && { findings: dto.findings || null }),
      ...(dto.notes !== undefined && { notes: dto.notes || null }),
    });

    if (dto.status === DentalStatus.IN_PROGRESS) {
      if (!t.performedBy && userId) t.performedBy = { id: userId } as User;
      if (!t.performedAt) t.performedAt = new Date();
    }
    if (dto.status === DentalStatus.COMPLETED) {
      if (!t.performedBy && userId) t.performedBy = { id: userId } as User;
      if (!t.performedAt) t.performedAt = new Date();
    }

    const saved = await this.dentalRepo.save(t);

    // Cancelling a billed treatment voids the charge (waive reverses it).
    if (nowCancelling && saved.billingId && userId) {
      try {
        await this.billing.waive(saved.billingId, 'Dental treatment cancelled', userId, facilityId);
      } catch (e) {
        console.error(`Voiding dental bill ${saved.billingId} failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  async remove(facilityId: string, id: string) {
    const t = await this.findOne(facilityId, id);
    return this.dentalRepo.remove(t);
  }
}
