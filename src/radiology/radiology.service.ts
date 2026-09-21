import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Radiology } from './entities/radiology.entity';
import { CreateRadiologyDto } from './dto/create-radiology.dto';
import { UpdateRadiologyDto } from './dto/update-radiology.dto';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { BillingService } from '../billing/billing.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { RadiologyExam } from './entities/radiology-exam.entity';
import { OclClient } from '../terminology/ocl.client';
import { RadiologyType, modalityToType } from './radiology-type.enum';
import { RadiologyStatus } from './radiology-status.enum';

const ACTIVE_VISIT_STATUSES = [
  VisitStatus.CHECKED_IN,
  VisitStatus.TRIAGE,
  VisitStatus.WAITING_FOR_DOCTOR,
  VisitStatus.WITH_DOCTOR,
];

@Injectable()
export class RadiologyService {
  constructor(
    @InjectRepository(Radiology)
    private radiologyRepo: Repository<Radiology>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Facility)
    private facilityRepo: Repository<Facility>,
    @InjectRepository(PatientVisit)
    private visitRepo: Repository<PatientVisit>,
    @InjectRepository(RadiologyExam)
    private examRepo: Repository<RadiologyExam>,
    private billing: BillingService,
    private ocl: OclClient,
  ) {}

  // ── Imaging exam catalogue (national, LOINC-coded) ──────────────────────────

  listExams(facilityId: string, activeOnly = false): Promise<RadiologyExam[]> {
    const qb = this.examRepo.createQueryBuilder('e').where('e.facilityId = :facilityId', { facilityId });
    if (activeOnly) qb.andWhere('e.isActive = true');
    return qb.orderBy('e.modality', 'ASC').addOrderBy('e.name', 'ASC').getMany();
  }

  async updateExam(facilityId: string, id: string, patch: { price?: number; isActive?: boolean; name?: string }) {
    const exam = await this.examRepo.findOne({ where: { id, facilityId } });
    if (!exam) throw new NotFoundException('Exam not found');
    if (patch.price !== undefined) exam.price = String(patch.price);
    if (patch.isActive !== undefined) exam.isActive = patch.isActive;
    if (patch.name !== undefined) exam.name = patch.name.trim();
    return this.examRepo.save(exam);
  }

  /**
   * DESTRUCTIVE: wipe the facility's radiology studies and exam catalogue, then
   * import the national imaging exams (KNHTS Investigations, Imaging domain),
   * each LOINC-coded. For a clean standardized start on dummy data.
   */
  async resetCatalogue(facilityId: string): Promise<{ studies: number; exams: number }> {
    const studies = (await this.radiologyRepo.find({ where: { facility: { id: facilityId } }, select: ['id'] })).length;
    await this.radiologyRepo.delete({ facility: { id: facilityId } });
    const exams = (await this.examRepo.find({ where: { facilityId }, select: ['id'] })).length;
    await this.examRepo.delete({ facilityId });
    return { studies, exams };
  }

  async importExamsFromKnhts(facilityId: string): Promise<number> {
    const existing = new Set(
      (await this.examRepo.find({ where: { facilityId }, select: ['knhtsCode'] }))
        .map((e) => e.knhtsCode)
        .filter(Boolean) as string[],
    );
    const limit = 100;
    let created = 0;
    for (let page = 1; page <= 400; page++) {
      const batch = await this.ocl.concepts('MOH-PPB', 'Investigations', page, limit);
      if (!batch.length) break;
      const rows = batch
        .filter((c) => (c.extras?.domain as string) === 'Imaging' && !existing.has(c.id))
        .map((c) =>
          this.examRepo.create({
            facilityId,
            name: c.display_name || c.id,
            modality: (c.extras?.subdomain as string) || null,
            knhtsCode: c.id,
            loincCode: (c.extras?.loinc_code as string) || null,
            loincName: (c.extras?.loinc_long_name as string) || null,
            price: '0',
          }),
        );
      if (rows.length) {
        await this.examRepo.save(rows);
        rows.forEach((r) => existing.add(r.knhtsCode as string));
        created += rows.length;
      }
      if (batch.length < limit) break;
    }
    return created;
  }

  async create(facilityId: string, dto: CreateRadiologyDto, userId?: string) {
    // Patient must belong to this facility — never trust an id across tenants.
    const patient = await this.patientRepo.findOneBy({ id: dto.patientId, facilityId });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilityRepo.findOneBy({ id: facilityId });
    if (!facility) throw new NotFoundException('Facility not found');

    // Ordered from the catalogue: the exam supplies modality, coding and the
    // default price (an explicit dto.price still wins, e.g. a waiver).
    let exam: RadiologyExam | null = null;
    if (dto.examId) {
      exam = await this.examRepo.findOne({ where: { id: dto.examId, facilityId } });
      if (!exam) throw new NotFoundException('Imaging exam not found');
    }
    const type = (dto.type as RadiologyType | undefined) ?? modalityToType(exam?.modality);
    const price = dto.price !== undefined && dto.price !== null ? Number(dto.price) || 0 : Number(exam?.price) || 0;
    const label = exam?.name ?? type;

    // Resolve a visit to bill against when a price is set: an explicit one, the
    // patient's active visit, or a lightweight anchor visit (as inpatient does).
    let visitId = await this.resolveVisit(facilityId, dto, price, label, userId);

    const r = this.radiologyRepo.create({
      type,
      examId: exam?.id ?? null,
      examName: exam?.name ?? null,
      loincCode: exam?.loincCode ?? null,
      bodyPart: dto.bodyPart ?? null,
      priority: dto.priority ?? 'ROUTINE',
      patient,
      facility,
      requestedBy: userId ? ({ id: userId } as User) : undefined,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      status: dto.scheduledAt ? RadiologyStatus.SCHEDULED : RadiologyStatus.REQUESTED,
      notes: dto.notes,
      price: price > 0 ? price.toFixed(2) : null,
      visitId,
    });
    const saved = await this.radiologyRepo.save(r);

    // Raise the imaging charge (revenue + a line for the cashier to collect).
    // Best-effort: a billing hiccup must never lose the imaging request itself.
    if (price > 0 && visitId) {
      try {
        const bill = await this.billing.create(
          {
            visitId,
            serviceType: ServiceType.IMAGING,
            serviceDescription: `Imaging: ${label}`,
            amount: price,
          },
          facilityId,
        );
        saved.billingId = bill.id;
        await this.radiologyRepo.save(saved);
      } catch (e) {
        console.error(`Radiology bill for "${label}" failed: ${(e as Error).message}`);
      }
    }
    return saved;
  }

  /**
   * Pick the visit an imaging charge hangs on. Only needed when a price is set.
   * Prefers an explicit visitId, then the patient's active visit, otherwise
   * opens a completed anchor visit so the bill has somewhere to live (the same
   * pattern inpatient admission uses) without touching the outpatient queue.
   */
  private async resolveVisit(
    facilityId: string,
    dto: CreateRadiologyDto,
    price: number,
    label: string,
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
        reasonForVisit: `Imaging: ${label}`,
        visitType: 'radiology',
        // Completed anchor: exists only to carry the bill, stays out of the queue.
        status: VisitStatus.COMPLETED,
        checkedInById: userId ?? null,
        checkedInAt: new Date(),
      }),
    );
    return anchor.id;
  }

  findAll(facilityId: string, filter: { patientId?: string; status?: string } = {}) {
    return this.radiologyRepo.find({
      where: {
        facility: { id: facilityId },
        ...(filter.patientId ? { patient: { id: filter.patientId } } : {}),
        ...(filter.status ? { status: filter.status as RadiologyStatus } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(facilityId: string, id: string) {
    const r = await this.radiologyRepo.findOne({ where: { id, facility: { id: facilityId } } });
    if (!r) throw new NotFoundException('Radiology not found');
    return r;
  }

  async update(facilityId: string, id: string, dto: UpdateRadiologyDto, userId?: string) {
    const r = await this.findOne(facilityId, id);
    const nowCancelling = dto.status === RadiologyStatus.CANCELLED && r.status !== RadiologyStatus.CANCELLED;

    Object.assign(r, {
      ...(dto.type && { type: dto.type as RadiologyType }),
      ...(dto.bodyPart !== undefined && { bodyPart: dto.bodyPart || null }),
      ...(dto.priority && { priority: dto.priority }),
      ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.status && { status: dto.status as RadiologyStatus }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.report !== undefined && { report: dto.report }),
      ...(dto.findings !== undefined && { findings: dto.findings || null }),
      ...(dto.impression !== undefined && { impression: dto.impression || null }),
    });

    // Stamp who performed the study, the first time it starts.
    if (dto.status === RadiologyStatus.IN_PROGRESS) {
      if (!r.performedBy && userId) r.performedBy = { id: userId } as User;
      if (!r.performedAt) r.performedAt = new Date();
    }

    // A report was written (or the study completed): record the reporter + time.
    const reportTouched = dto.findings !== undefined || dto.impression !== undefined || dto.report !== undefined;
    if (reportTouched || dto.status === RadiologyStatus.COMPLETED) {
      if (userId) r.reportedBy = { id: userId } as User;
      r.reportedAt = new Date();
    }

    const saved = await this.radiologyRepo.save(r);

    // Cancelling a billed study voids its charge: waive the bill (which reverses
    // the receivable) so the patient no longer owes it. A paid bill is left as
    // is — a refund is a deliberate finance action. Best-effort.
    if (nowCancelling && saved.billingId && userId) {
      try {
        await this.billing.waive(saved.billingId, 'Radiology study cancelled', userId, facilityId);
      } catch (e) {
        console.error(`Voiding radiology bill ${saved.billingId} failed: ${(e as Error).message}`);
      }
    }

    return saved;
  }

  async remove(facilityId: string, id: string) {
    const r = await this.findOne(facilityId, id);
    return this.radiologyRepo.remove(r);
  }
}
