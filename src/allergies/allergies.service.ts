import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PatientAllergy } from './entities/patient-allergy.entity';
import { CreateAllergyDto, UpdateAllergyDto } from './dto/allergy.dto';
import { AllergyStatus } from './allergy.enums';
import { Patient } from '../patients/entities/patient.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const today = () => new Date().toISOString().slice(0, 10);

/** One line of the patient's medication list, derived from what was prescribed. */
export interface MedicationListEntry {
  prescriptionId: string;
  itemId: string | null;
  rxNo: string;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  prescribedOn: string;
  prescriber: string | null;
  dispensed: boolean;
  dispensedOn: string | null;
  /** HPT binding of the stock item it was dispensed from. */
  hptCode: string | null;
  atcCode: string | null;
  activeComponentCode: string | null;
  /** When the course is expected to end, where a duration was written down. */
  expectedEnd: string | null;
  /** Why we believe it is still being taken — or that we cannot tell. */
  activeBasis: 'within-duration' | 'duration-not-recorded' | 'ended';
}

/**
 * Read a written duration ("5 days", "2/52", "1 week") as a number of days.
 * Returns null when it cannot be read — the list then says so rather than
 * guessing an end date.
 */
export function durationDays(duration?: string | null): number | null {
  const d = (duration ?? '').trim().toLowerCase();
  if (!d) return null;
  // Kenyan shorthand: n/7 = weeks, n/12 = months, n/52 = weeks.
  const shorthand = d.match(/^(\d+)\s*\/\s*(7|12|52)$/);
  if (shorthand) {
    const n = Number(shorthand[1]);
    return shorthand[2] === '12' ? n * 30 : n * 7;
  }
  const m = d.match(/^(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|wk|wks|w|month|months|mon|m|year|years|yr|y)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith('d')) return n;
  if (unit.startsWith('w')) return n * 7;
  if (unit.startsWith('mon') || unit === 'm' || unit.startsWith('month')) return n * 30;
  if (unit.startsWith('y')) return n * 365;
  return null;
}

@Injectable()
export class AllergiesService {
  constructor(
    @InjectRepository(PatientAllergy) private readonly allergies: Repository<PatientAllergy>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Prescription) private readonly prescriptions: Repository<Prescription>,
    @InjectRepository(InventoryItem) private readonly items: Repository<InventoryItem>,
  ) {}

  private fullName(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  private async assertPatient(facilityId: string, patientId: string) {
    const p = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  /**
   * The allergy list (active) or the full allergy history. History keeps
   * resolved, inactive and refuted entries — they are clinically meaningful.
   */
  async list(facilityId: string, patientId: string, activeOnly = false): Promise<PatientAllergy[]> {
    await this.assertPatient(facilityId, patientId);
    const where = activeOnly
      ? { facilityId, patientId, status: 'active' as AllergyStatus }
      : { facilityId, patientId };
    return this.allergies.find({ where, order: { criticality: 'DESC', createdAt: 'DESC' } });
  }

  async create(facilityId: string, dto: CreateAllergyDto, user?: CurrentUserType): Promise<PatientAllergy> {
    await this.assertPatient(facilityId, dto.patientId);
    const name = dto.allergenName.trim();

    // Don't let the same allergen be recorded twice while it is still active —
    // a duplicated allergy is a weaker warning, not a stronger one.
    const active = await this.allergies.find({
      where: { facilityId, patientId: dto.patientId, status: 'active' as AllergyStatus },
    });
    const dup = active.find(
      (a) =>
        (dto.hptCode && a.hptCode === dto.hptCode) ||
        (dto.knhtsCode && a.knhtsCode === dto.knhtsCode) ||
        a.allergenName.trim().toLowerCase() === name.toLowerCase(),
    );
    if (dup) throw new BadRequestException(`${dup.allergenName} is already on this patient's allergy list`);

    const entry = this.allergies.create({
      facilityId,
      patientId: dto.patientId,
      allergenType: dto.allergenType as PatientAllergy['allergenType'],
      allergenName: name,
      knhtsCode: dto.knhtsCode?.trim() || null,
      knhtsSystem: dto.knhtsSystem?.trim() || null,
      hptCode: dto.hptCode?.trim() || null,
      hptName: dto.hptName?.trim() || null,
      kind: (dto.kind as PatientAllergy['kind']) ?? 'allergy',
      manifestations: (dto.manifestations ?? []).map((m) => ({ code: m.code ?? null, display: m.display })),
      severity: (dto.severity as PatientAllergy['severity']) ?? null,
      criticality: (dto.criticality as PatientAllergy['criticality']) ?? null,
      status: 'active',
      verificationStatus: (dto.verificationStatus as PatientAllergy['verificationStatus']) ?? 'unconfirmed',
      onsetDate: dto.onsetDate ?? null,
      lastOccurrence: dto.lastOccurrence ?? null,
      note: dto.note ?? null,
      recordedById: user?.id ?? null,
      recordedByName: this.fullName(user),
      revisions: [],
    });
    return this.allergies.save(entry);
  }

  async update(facilityId: string, id: string, dto: UpdateAllergyDto, user?: CurrentUserType): Promise<PatientAllergy> {
    const entry = await this.allergies.findOne({ where: { id, facilityId } });
    if (!entry) throw new NotFoundException('Allergy not found');

    if (dto.status && dto.status !== entry.status) {
      entry.revisions = [
        ...(entry.revisions ?? []),
        {
          at: new Date().toISOString(),
          byId: user?.id ?? null,
          byName: this.fullName(user),
          from: entry.status,
          to: dto.status as AllergyStatus,
          reason: dto.statusReason?.trim() || null,
        },
      ];
      entry.status = dto.status as AllergyStatus;
    }
    if (dto.severity !== undefined) entry.severity = dto.severity as PatientAllergy['severity'];
    if (dto.criticality !== undefined) entry.criticality = dto.criticality as PatientAllergy['criticality'];
    if (dto.verificationStatus !== undefined) {
      entry.verificationStatus = dto.verificationStatus as PatientAllergy['verificationStatus'];
    }
    if (dto.manifestations !== undefined) {
      entry.manifestations = dto.manifestations.map((m) => ({ code: m.code ?? null, display: m.display }));
    }
    if (dto.lastOccurrence !== undefined) entry.lastOccurrence = dto.lastOccurrence ?? null;
    if (dto.note !== undefined) entry.note = dto.note ?? null;
    return this.allergies.save(entry);
  }

  /**
   * Does anything on this patient's active allergy list match the drug about to
   * be prescribed or dispensed? Matched on the HPT active component first (the
   * reliable link), then on the name as a fallback. A name match is reported as
   * `possible` so the prescriber knows it is weaker evidence.
   */
  async checkDrug(
    facilityId: string,
    patientId: string,
    drug: { itemId?: string | null; name?: string | null },
  ): Promise<{ match: 'component' | 'possible'; allergy: PatientAllergy }[]> {
    const active = await this.allergies.find({
      where: { facilityId, patientId, status: 'active' as AllergyStatus },
    });
    if (!active.length) return [];

    let item: InventoryItem | null = null;
    if (drug.itemId) item = await this.items.findOne({ where: { id: drug.itemId, facilityId } });
    const name = (drug.name ?? item?.name ?? '').trim().toLowerCase();
    const component = item?.activeComponentCode ?? null;

    const hits: { match: 'component' | 'possible'; allergy: PatientAllergy }[] = [];
    for (const a of active) {
      if (component && a.hptCode && a.hptCode === component) {
        hits.push({ match: 'component', allergy: a });
        continue;
      }
      const allergen = a.allergenName.trim().toLowerCase();
      if (name && allergen && (name.includes(allergen) || allergen.includes(name))) {
        hits.push({ match: 'possible', allergy: a });
      }
    }
    return hits;
  }

  /**
   * The patient's medication list, built from what was actually prescribed.
   * `active` keeps a line while its written duration still runs; a line whose
   * duration was never recorded is kept and flagged rather than guessed at,
   * because dropping it would hide a drug the patient may still be taking.
   */
  async medications(
    facilityId: string,
    patientId: string,
    activeOnly = false,
  ): Promise<MedicationListEntry[]> {
    await this.assertPatient(facilityId, patientId);
    const rxs = await this.prescriptions.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
    });

    const itemIds = Array.from(
      new Set(rxs.flatMap((r) => (r.items ?? []).map((i) => i.itemId).filter((x): x is string => !!x))),
    );
    const items = itemIds.length ? await this.items.find({ where: { id: In(itemIds) } }) : [];
    const byId = new Map(items.map((i) => [i.id, i]));
    const now = today();

    const rows: MedicationListEntry[] = [];
    for (const rx of rxs) {
      if (rx.status === 'cancelled') continue;
      const start = (rx.dispensedAt ?? rx.createdAt) as unknown as string;
      const startDay = start ? new Date(start).toISOString().slice(0, 10) : null;
      for (const line of rx.items ?? []) {
        const item = line.itemId ? byId.get(line.itemId) : undefined;
        const days = durationDays(line.duration);
        let expectedEnd: string | null = null;
        if (startDay && days != null) {
          const e = new Date(startDay);
          e.setDate(e.getDate() + days);
          expectedEnd = e.toISOString().slice(0, 10);
        }
        const basis: MedicationListEntry['activeBasis'] =
          expectedEnd == null ? 'duration-not-recorded' : expectedEnd >= now ? 'within-duration' : 'ended';
        if (activeOnly && basis === 'ended') continue;
        rows.push({
          prescriptionId: rx.id,
          itemId: line.itemId ?? null,
          rxNo: rx.rxNo,
          medication: line.medication,
          dosage: line.dosage ?? null,
          frequency: line.frequency ?? null,
          duration: line.duration ?? null,
          instructions: line.instructions ?? null,
          prescribedOn: startDay ?? '',
          prescriber: rx.doctorName ?? null,
          dispensed: !!line.dispensed,
          dispensedOn: rx.dispensedAt ? new Date(rx.dispensedAt).toISOString().slice(0, 10) : null,
          hptCode: item?.knhtsCode ?? null,
          atcCode: item?.atcCode ?? null,
          activeComponentCode: item?.activeComponentCode ?? null,
          expectedEnd,
          activeBasis: basis,
        });
      }
    }
    return rows;
  }
}
