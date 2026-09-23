import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClinicalServiceOrder } from './entities/clinical-service-order.entity';
import { CreateServiceOrderDto, RecordSessionDto, UpdateServiceOrderDto } from './dto/service-order.dto';
import { ServiceDiscipline, ServiceOrderStatus, DISCIPLINE_LABELS } from './service-order.enums';
import { Patient } from '../patients/entities/patient.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { BillingService } from '../billing/billing.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

// The same set the imaging and inpatient flows treat as an open visit.
const ACTIVE_VISIT_STATUSES = [
  VisitStatus.CHECKED_IN,
  VisitStatus.TRIAGE,
  VisitStatus.WAITING_FOR_DOCTOR,
  VisitStatus.WITH_DOCTOR,
];

@Injectable()
export class ServiceOrdersService {
  constructor(
    @InjectRepository(ClinicalServiceOrder) private readonly orders: Repository<ClinicalServiceOrder>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientVisit) private readonly visits: Repository<PatientVisit>,
    private readonly billing: BillingService,
    private readonly catalog: ServiceCatalogService,
  ) {}

  private fullName(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  /**
   * The visit a charge hangs on: an explicit one, the patient's active visit,
   * or a lightweight completed visit that exists only to carry the bill —
   * the same pattern imaging and inpatient use, so therapy ordered outside a
   * consultation can still be charged without disturbing the queue.
   */
  private async resolveVisit(
    facilityId: string,
    patientId: string,
    visitId: string | undefined,
    price: number,
    label: string,
    userId?: string,
  ): Promise<string | null> {
    if (visitId) {
      const v = await this.visits.findOne({ where: { id: visitId, facilityId } });
      if (!v) throw new NotFoundException('Visit not found');
      return v.id;
    }
    if (price <= 0) return null;
    const active = await this.visits.findOne({
      where: { facilityId, patientId, status: In(ACTIVE_VISIT_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    if (active) return active.id;
    const anchor = await this.visits.save(
      this.visits.create({
        facilityId,
        patientId,
        reasonForVisit: label,
        visitType: 'therapy',
        status: VisitStatus.COMPLETED,
        checkedInById: userId ?? null,
        checkedInAt: new Date(),
      }),
    );
    return anchor.id;
  }

  async create(facilityId: string, dto: CreateServiceOrderDto, user?: CurrentUserType) {
    const patient = await this.patients.findOne({ where: { id: dto.patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    let service: ServiceCatalogItem | null = null;
    if (dto.serviceId) service = await this.catalog.findOne(dto.serviceId, facilityId);

    const discipline = dto.discipline as ServiceDiscipline;
    const price = dto.price !== undefined && dto.price !== null ? Number(dto.price) || 0 : Number(service?.defaultPrice) || 0;
    if (service && price > 0) await this.catalog.rememberPrice(facilityId, service.id, price, !!dto.saveAsServicePrice);
    const label = service?.name ?? DISCIPLINE_LABELS[discipline];
    const visitId = await this.resolveVisit(facilityId, dto.patientId, dto.visitId, price, label, user?.id);

    const order = await this.orders.save(
      this.orders.create({
        facilityId,
        patientId: dto.patientId,
        patientName: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || null,
        visitId,
        discipline,
        serviceId: service?.id ?? null,
        serviceName: service?.name ?? null,
        knhtsCode: service?.knhtsCode ?? null,
        reason: dto.reason ?? null,
        priority: (dto.priority as ClinicalServiceOrder['priority']) ?? 'routine',
        status: dto.scheduledAt ? 'scheduled' : 'requested',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        sessionsPlanned: dto.sessionsPlanned ?? null,
        sessions: [],
        orderedById: user?.id ?? null,
        orderedByName: this.fullName(user),
        price: price > 0 ? price.toFixed(2) : null,
      }),
    );

    // Best-effort: a billing hiccup must never lose the order itself.
    if (price > 0 && visitId) {
      try {
        const bill = await this.billing.create(
          {
            visitId,
            serviceType: ServiceType.PROCEDURE,
            serviceDescription: `${DISCIPLINE_LABELS[discipline]}: ${label}`,
            amount: price,
          },
          facilityId,
        );
        order.billingId = bill.id;
        await this.orders.save(order);
      } catch (e) {
        console.error(`Service-order bill for "${label}" failed: ${(e as Error).message}`);
      }
    }
    return order;
  }

  /** A department's worklist, or one patient's orders. */
  list(
    facilityId: string,
    filter: { discipline?: string; status?: string; patientId?: string } = {},
  ): Promise<ClinicalServiceOrder[]> {
    const qb = this.orders.createQueryBuilder('o').where('o.facilityId = :facilityId', { facilityId });
    if (filter.discipline) qb.andWhere('o.discipline = :discipline', { discipline: filter.discipline });
    if (filter.status) qb.andWhere('o.status = :status', { status: filter.status });
    if (filter.patientId) qb.andWhere('o.patient_id = :patientId', { patientId: filter.patientId });
    return qb.orderBy('o.created_at', 'DESC').getMany();
  }

  private async getOne(facilityId: string, id: string): Promise<ClinicalServiceOrder> {
    const order = await this.orders.findOne({ where: { id, facilityId } });
    if (!order) throw new NotFoundException('Service order not found');
    return order;
  }

  async update(facilityId: string, id: string, dto: UpdateServiceOrderDto, user?: CurrentUserType) {
    const order = await this.getOne(facilityId, id);
    const wasOpen = order.status !== 'cancelled' && order.status !== 'completed';

    if (dto.status) order.status = dto.status as ServiceOrderStatus;
    if (dto.scheduledAt !== undefined) order.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.reason !== undefined) order.reason = dto.reason ?? null;
    if (dto.outcome !== undefined) order.outcome = dto.outcome ?? null;
    if (dto.sessionsPlanned !== undefined) order.sessionsPlanned = dto.sessionsPlanned ?? null;
    if (order.status === 'completed' && !order.completedAt) order.completedAt = new Date();

    const saved = await this.orders.save(order);

    // Cancelling an unstarted order should not leave its charge standing.
    if (wasOpen && saved.status === 'cancelled' && saved.billingId && user?.id) {
      try {
        await this.billing.waive(saved.billingId, 'Service order cancelled', user.id, facilityId);
      } catch (e) {
        console.error(`Voiding service-order bill ${saved.billingId} failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  /**
   * Record a session of care. Therapies run as a course, so each session is
   * kept in its own right and may carry its own charge.
   */
  async recordSession(facilityId: string, id: string, dto: RecordSessionDto, user?: CurrentUserType) {
    const order = await this.getOne(facilityId, id);
    if (order.status === 'cancelled') throw new BadRequestException('This order was cancelled');

    const price = Number(dto.price) || 0;
    let billingId: string | null = null;
    if (price > 0) {
      const visitId =
        order.visitId ??
        (await this.resolveVisit(
          facilityId,
          order.patientId,
          undefined,
          price,
          order.serviceName ?? DISCIPLINE_LABELS[order.discipline],
          user?.id,
        ));
      if (visitId) {
        if (!order.visitId) order.visitId = visitId;
        try {
          const bill = await this.billing.create(
            {
              visitId,
              serviceType: ServiceType.PROCEDURE,
              serviceDescription: `${DISCIPLINE_LABELS[order.discipline]} session: ${order.serviceName ?? ''}`.trim(),
              amount: price,
            },
            facilityId,
          );
          billingId = bill.id;
        } catch (e) {
          console.error(`Session bill failed: ${(e as Error).message}`);
        }
      }
    }

    order.sessions = [
      ...(order.sessions ?? []),
      {
        at: new Date().toISOString(),
        byId: user?.id ?? null,
        byName: this.fullName(user),
        notes: dto.notes.trim(),
        billingId,
      },
    ];
    // Recording work means the course has started.
    if (order.status === 'requested' || order.status === 'scheduled') order.status = 'in_progress';
    return this.orders.save(order);
  }
}
