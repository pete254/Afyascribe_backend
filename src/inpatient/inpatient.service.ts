import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Ward } from './entities/ward.entity';
import { Bed } from './entities/bed.entity';
import { Admission } from './entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { InpatientBillingService } from './inpatient-billing.service';
import {
  CreateWardDto,
  UpdateWardDto,
  CreateBedsDto,
  UpdateBedDto,
  CreateAdmissionDto,
  DischargeAdmissionDto,
  TransferAdmissionDto,
} from './dto/inpatient.dto';

@Injectable()
export class InpatientService {
  constructor(
    @InjectRepository(Ward) private readonly wardRepo: Repository<Ward>,
    @InjectRepository(Bed) private readonly bedRepo: Repository<Bed>,
    @InjectRepository(Admission) private readonly admRepo: Repository<Admission>,
    @InjectRepository(Patient) private readonly patientRepo: Repository<Patient>,
    @InjectRepository(PatientVisit) private readonly visitRepo: Repository<PatientVisit>,
    private readonly inpatientBilling: InpatientBillingService,
  ) {}

  // ── Wards ──────────────────────────────────────────────────────────────────
  async listWards(facilityId: string) {
    const wards = await this.wardRepo.find({ where: { facilityId }, order: { name: 'ASC' } });
    const beds = await this.bedRepo.find({ where: { facilityId } });
    return wards.map((w) => {
      const wb = beds.filter((b) => b.wardId === w.id && b.isActive);
      return {
        ...w,
        beds: wb.length,
        occupied: wb.filter((b) => b.status === 'occupied').length,
        available: wb.filter((b) => b.status === 'available').length,
        blocked: wb.filter((b) => b.status === 'blocked').length,
      };
    });
  }

  async createWard(facilityId: string, dto: CreateWardDto) {
    const ward = await this.wardRepo.save(
      this.wardRepo.create({
        facilityId,
        name: dto.name.trim(),
        wardType: dto.wardType ?? 'general',
        bedChargeMode: dto.bedChargeMode ?? 'normal',
        bedDailyCharge: String(dto.bedDailyCharge ?? 0),
      }),
    );
    if (dto.bedCount && dto.bedCount > 0) {
      await this.bedRepo.save(
        Array.from({ length: dto.bedCount }, (_, i) =>
          this.bedRepo.create({ facilityId, wardId: ward.id, label: String(i + 1), status: 'available' }),
        ),
      );
    }
    return ward;
  }

  async updateWard(facilityId: string, id: string, dto: UpdateWardDto) {
    const ward = await this.wardRepo.findOne({ where: { id, facilityId } });
    if (!ward) throw new NotFoundException('Ward not found');
    if (dto.name !== undefined) ward.name = dto.name.trim();
    if (dto.wardType !== undefined) ward.wardType = dto.wardType;
    if (dto.bedChargeMode !== undefined) ward.bedChargeMode = dto.bedChargeMode;
    if (dto.bedDailyCharge !== undefined) ward.bedDailyCharge = String(dto.bedDailyCharge);
    if (dto.isActive !== undefined) ward.isActive = dto.isActive;
    return this.wardRepo.save(ward);
  }

  async deleteWard(facilityId: string, id: string) {
    const occupied = await this.bedRepo.count({ where: { facilityId, wardId: id, status: 'occupied' } });
    if (occupied > 0)
      throw new BadRequestException('This ward has occupied beds. Discharge or transfer those patients first.');
    await this.bedRepo.delete({ facilityId, wardId: id });
    await this.wardRepo.delete({ id, facilityId });
    return { deleted: true };
  }

  // ── Beds ───────────────────────────────────────────────────────────────────
  listBeds(facilityId: string, wardId?: string) {
    return this.bedRepo.find({
      where: wardId ? { facilityId, wardId } : { facilityId },
      order: { createdAt: 'ASC' },
    });
  }

  async addBeds(facilityId: string, dto: CreateBedsDto) {
    const ward = await this.wardRepo.findOne({ where: { id: dto.wardId, facilityId } });
    if (!ward) throw new NotFoundException('Ward not found');
    if (dto.label) {
      return this.bedRepo.save(
        this.bedRepo.create({ facilityId, wardId: dto.wardId, label: dto.label.trim(), status: 'available' }),
      );
    }
    const count = dto.count ?? 1;
    const existing = await this.bedRepo.find({ where: { facilityId, wardId: dto.wardId } });
    let next = existing.reduce((m, b) => Math.max(m, Number(b.label) || 0), 0) + 1;
    const rows = Array.from({ length: count }, () =>
      this.bedRepo.create({ facilityId, wardId: dto.wardId, label: String(next++), status: 'available' }),
    );
    return this.bedRepo.save(rows);
  }

  async updateBed(facilityId: string, id: string, dto: UpdateBedDto) {
    const bed = await this.bedRepo.findOne({ where: { id, facilityId } });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.status === 'occupied' && dto.status && dto.status !== 'occupied')
      throw new BadRequestException('This bed is occupied — discharge the patient before changing it.');
    if (dto.label !== undefined) bed.label = dto.label.trim();
    if (dto.status !== undefined) bed.status = dto.status;
    if (dto.isActive !== undefined) bed.isActive = dto.isActive;
    return this.bedRepo.save(bed);
  }

  async deleteBed(facilityId: string, id: string) {
    const bed = await this.bedRepo.findOne({ where: { id, facilityId } });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.status === 'occupied') throw new BadRequestException('This bed is occupied.');
    await this.bedRepo.delete({ id, facilityId });
    return { deleted: true };
  }

  // ── Admissions ─────────────────────────────────────────────────────────────
  private async enrich(admissions: Admission[]) {
    if (admissions.length === 0) return [];
    const patientIds = [...new Set(admissions.map((a) => a.patientId))];
    const wardIds = [...new Set(admissions.map((a) => a.wardId))];
    const bedIds = [...new Set(admissions.map((a) => a.bedId).filter(Boolean) as string[])];
    const patients = patientIds.length ? await this.patientRepo.find({ where: { id: In(patientIds) } }) : [];
    const wards = wardIds.length ? await this.wardRepo.find({ where: { id: In(wardIds) } }) : [];
    const beds = bedIds.length ? await this.bedRepo.find({ where: { id: In(bedIds) } }) : [];
    const pMap = new Map(patients.map((p) => [p.id, p]));
    const wMap = new Map(wards.map((w) => [w.id, w]));
    const bMap = new Map(beds.map((b) => [b.id, b]));
    return admissions.map((a) => {
      const p = pMap.get(a.patientId);
      return {
        ...a,
        patientName: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
        patientNo: p?.patientId ?? null,
        wardName: wMap.get(a.wardId)?.name ?? null,
        bedLabel: a.bedId ? bMap.get(a.bedId)?.label ?? null : null,
      };
    });
  }

  async listAdmissions(facilityId: string, status?: string) {
    const admissions = await this.admRepo.find({
      where: status ? { facilityId, status } : { facilityId },
      order: { admittedAt: 'DESC' },
      take: status === 'admitted' ? undefined : 500,
    });
    return this.enrich(admissions);
  }

  async admit(facilityId: string, dto: CreateAdmissionDto, userId?: string) {
    const patient = await this.patientRepo.findOne({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');
    // Block a second active admission for the same patient.
    const active = await this.admRepo.findOne({
      where: { facilityId, patientId: dto.patientId, status: 'admitted' },
    });
    if (active) throw new BadRequestException('This patient is already admitted.');

    let bedId = dto.bedId ?? null;
    if (bedId) {
      const bed = await this.bedRepo.findOne({ where: { id: bedId, facilityId } });
      if (!bed) throw new NotFoundException('Bed not found');
      if (bed.status !== 'available') throw new BadRequestException('That bed is not available.');
      bed.status = 'occupied';
      await this.bedRepo.save(bed);
    }

    // Every admission needs a visit to hang its running bill on. Reuse the one
    // passed in (e.g. admitted straight from an outpatient visit) or open a
    // dedicated inpatient visit.
    let visitId = dto.visitId ?? null;
    if (!visitId) {
      const visit = await this.visitRepo.save(
        this.visitRepo.create({
          facilityId,
          patientId: dto.patientId,
          reasonForVisit: dto.admissionDiagnosis?.trim() || 'Inpatient admission',
          visitType: 'inpatient',
          // Kept out of the outpatient queue/stats (which only track active
          // statuses); this visit exists purely to anchor the running bill.
          status: VisitStatus.COMPLETED,
          checkedInById: userId ?? null,
          checkedInAt: new Date(),
        }),
      );
      visitId = visit.id;
    }

    const count = await this.admRepo.count({ where: { facilityId } });
    const admission = await this.admRepo.save(
      this.admRepo.create({
        facilityId,
        admissionNo: `ADM-${String(count + 1).padStart(5, '0')}`,
        patientId: dto.patientId,
        wardId: dto.wardId,
        bedId,
        visitId,
        admittedAt: dto.admittedAt ? new Date(dto.admittedAt) : new Date(),
        admittedById: userId ?? null,
        admissionDiagnosis: dto.admissionDiagnosis ?? null,
        status: 'admitted',
      }),
    );

    // Take the admission deposit up front (best-effort; never blocks the admit).
    if (dto.depositAmount && dto.depositAmount > 0) {
      try {
        await this.inpatientBilling.collectDeposit(
          facilityId,
          admission.id,
          { amount: dto.depositAmount, method: dto.depositMethod ?? 'cash' },
          userId,
        );
      } catch {
        /* deposit can be topped up later from the Kardex */
      }
    }

    const fresh = (await this.admRepo.findOne({ where: { id: admission.id } })) ?? admission;
    return (await this.enrich([fresh]))[0];
  }

  async discharge(facilityId: string, id: string, dto: DischargeAdmissionDto) {
    const adm = await this.admRepo.findOne({ where: { id, facilityId } });
    if (!adm) throw new NotFoundException('Admission not found');
    if (adm.status === 'discharged') throw new BadRequestException('Already discharged.');

    // A patient who was discharged/referred can only leave once the running bill
    // is settled (deposit applied first). Deceased/absconded can't pay, so they
    // are exempt; `force` lets an admin override with a documented decision.
    if (!dto.force && (dto.outcome === 'discharged' || dto.outcome === 'referred')) {
      const outstanding = await this.inpatientBilling.outstandingForDischarge(facilityId, adm);
      if (outstanding > 0) {
        throw new BadRequestException(
          `Outstanding balance of KES ${outstanding.toLocaleString()} must be settled (or the discharge overridden) before release.`,
        );
      }
    }

    adm.status = 'discharged';
    adm.dischargedAt = dto.dischargedAt ? new Date(dto.dischargedAt) : new Date();
    adm.outcome = dto.outcome;
    adm.dischargeNotes = dto.dischargeNotes ?? null;
    await this.admRepo.save(adm);
    if (adm.bedId) {
      await this.bedRepo.update({ id: adm.bedId, facilityId }, { status: 'available' });
    }
    return (await this.enrich([adm]))[0];
  }

  async transfer(facilityId: string, id: string, dto: TransferAdmissionDto) {
    const adm = await this.admRepo.findOne({ where: { id, facilityId } });
    if (!adm) throw new NotFoundException('Admission not found');
    if (adm.status !== 'admitted') throw new BadRequestException('Only an active admission can be transferred.');
    const ward = await this.wardRepo.findOne({ where: { id: dto.wardId, facilityId } });
    if (!ward) throw new NotFoundException('Ward not found');

    let newBedId = dto.bedId ?? null;
    if (newBedId) {
      const bed = await this.bedRepo.findOne({ where: { id: newBedId, facilityId } });
      if (!bed) throw new NotFoundException('Bed not found');
      if (bed.status !== 'available') throw new BadRequestException('That bed is not available.');
      bed.status = 'occupied';
      await this.bedRepo.save(bed);
    }
    // Free the old bed.
    if (adm.bedId && adm.bedId !== newBedId) {
      await this.bedRepo.update({ id: adm.bedId, facilityId }, { status: 'available' });
    }
    adm.wardId = dto.wardId;
    adm.bedId = newBedId;
    await this.admRepo.save(adm);
    return (await this.enrich([adm]))[0];
  }

  /** Current inpatient census — active admissions + per-ward occupancy. */
  async census(facilityId: string) {
    const admitted = await this.enrich(
      await this.admRepo.find({ where: { facilityId, status: 'admitted' }, order: { admittedAt: 'DESC' } }),
    );
    const wards = await this.listWards(facilityId);
    const totalBeds = wards.reduce((s, w) => s + w.beds, 0);
    const occupied = wards.reduce((s, w) => s + w.occupied, 0);
    return {
      wards,
      admitted,
      totals: {
        admitted: admitted.length,
        beds: totalBeds,
        occupied,
        available: wards.reduce((s, w) => s + w.available, 0),
        occupancyRate: totalBeds > 0 ? Math.round((occupied / totalBeds) * 1000) / 10 : 0,
      },
    };
  }
}
