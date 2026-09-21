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
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
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
    private catalog: ServiceCatalogService,
  ) {}

  async create(facilityId: string, dto: CreateOpticalDto, userId?: string) {
    const patient = await this.patientRepo.findOneBy({ id: dto.patientId, facilityId });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilityRepo.findOneBy({ id: facilityId });
    if (!facility) throw new NotFoundException('Facility not found');

    let service: ServiceCatalogItem | null = null;
    if (dto.serviceId) service = await this.catalog.findOne(dto.serviceId, facilityId);
    const price = dto.price !== undefined && dto.price !== null ? Number(dto.price) || 0 : Number(service?.defaultPrice) || 0;
    if (service && price > 0) await this.catalog.rememberPrice(facilityId, service.id, price, !!dto.saveAsServicePrice);
    const visitId = await this.resolveVisit(facilityId, dto, price, userId);

    const rx = this.opticalRepo.create({
      patient,
      facility,
      visitId,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      knhtsCode: service?.knhtsCode ?? null,
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
        const desc = [service?.name ? `Optical: ${service.name}` : 'Optical', dto.frame, dto.lensType].filter(Boolean).join(' — ');
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
    if (dto.framePrice !== undefined) rx.framePrice = dto.framePrice > 0 ? dto.framePrice.toFixed(2) : null;
    if (dto.lensPrice !== undefined) rx.lensPrice = dto.lensPrice > 0 ? dto.lensPrice.toFixed(2) : null;
    const nowDispensing = dto.status === OpticalStatus.DISPENSED && !rx.dispensedAt;
    if (nowDispensing) rx.dispensedAt = new Date();
    if (userId) rx.optometrist = { id: userId } as User;

    const saved = await this.opticalRepo.save(rx);

    // Frame + lenses are billed as one dispensing charge the first time the
    // record is marked dispensed. Best-effort: a billing hiccup must not undo
    // the dispensing itself.
    const dispenseTotal = (Number(saved.framePrice) || 0) + (Number(saved.lensPrice) || 0);
    if (nowDispensing && dispenseTotal > 0 && !saved.dispenseBillingId) {
      try {
        const visitId =
          saved.visitId ??
          (await this.resolveVisit(
            facilityId,
            { patientId: saved.patient.id } as CreateOpticalDto,
            dispenseTotal,
            userId,
          ));
        if (visitId) {
          if (!saved.visitId) saved.visitId = visitId;
          const parts = [
            saved.frame ? `Frame: ${saved.frame}${Number(saved.framePrice) > 0 ? ` (${Number(saved.framePrice).toFixed(2)})` : ''}` : null,
            saved.lensType ? `Lenses: ${saved.lensType}${Number(saved.lensPrice) > 0 ? ` (${Number(saved.lensPrice).toFixed(2)})` : ''}` : null,
          ].filter(Boolean);
          const bill = await this.billing.create(
            {
              visitId,
              serviceType: ServiceType.PROCEDURE,
              serviceDescription: `Optical dispensing${parts.length ? ` — ${parts.join(' · ')}` : ''}`,
              amount: Math.round(dispenseTotal * 100) / 100,
            },
            facilityId,
          );
          saved.dispenseBillingId = bill.id;
          await this.opticalRepo.save(saved);
        }
      } catch (e) {
        console.error(`Optical dispensing bill failed: ${(e as Error).message}`);
      }
    }

    if (nowCancelling && userId) {
      for (const billId of [saved.billingId, saved.dispenseBillingId]) {
        if (!billId) continue;
        try {
          await this.billing.waive(billId, 'Optical order cancelled', userId, facilityId);
        } catch (e) {
          console.error(`Voiding optical bill ${billId} failed: ${(e as Error).message}`);
        }
      }
    }
    return saved;
  }

  async remove(facilityId: string, id: string) {
    const rx = await this.findOne(facilityId, id);
    return this.opticalRepo.remove(rx);
  }
}
