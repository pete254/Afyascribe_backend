import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { PatientAllergy } from '../allergies/entities/patient-allergy.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabAnalyte } from '../lab/entities/lab-analyte.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { gestationOn } from '../maternity/gestation';
import { bmiFrom } from '../common/clinical/anthropometry';
import { Advice, CdsContext, CdsDrug, CdsLab, DATA_SOURCES_USED, evaluate } from './cds';

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface CdsResult {
  patientId: string;
  advice: Advice[];
  /** What the rules were given, so a clinician can see why they said nothing. */
  context: {
    ageYears: number | null;
    problems: number;
    allergies: number;
    labs: number;
    hasVitals: boolean;
    pregnancy: boolean;
  };
  /** Parts of the record the rule set can read, for the certification record. */
  dataSources: typeof DATA_SOURCES_USED;
}

@Injectable()
export class CdsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientProblem) private readonly problems: Repository<PatientProblem>,
    @InjectRepository(PatientAllergy) private readonly allergies: Repository<PatientAllergy>,
    @InjectRepository(PatientVisit) private readonly visits: Repository<PatientVisit>,
    @InjectRepository(LabOrder) private readonly labOrders: Repository<LabOrder>,
    @InjectRepository(LabAnalyte) private readonly analytes: Repository<LabAnalyte>,
    @InjectRepository(InventoryItem) private readonly items: Repository<InventoryItem>,
    @InjectRepository(Pregnancy) private readonly pregnancies: Repository<Pregnancy>,
    @InjectRepository(AncContact) private readonly ancContacts: Repository<AncContact>,
  ) {}

  /** Advice for a patient, optionally about a drug that is about to be given. */
  async forPatient(
    facilityId: string,
    patientId: string,
    opts: { itemId?: string; drugName?: string } = {},
  ): Promise<CdsResult> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const [problems, allergies, pregnancy] = await Promise.all([
      this.problems.find({ where: { facilityId, patientId } }),
      this.allergies.find({ where: { facilityId, patientId, status: Not('entered-in-error') } }),
      this.pregnancies.findOne({ where: { facilityId, patientId, status: 'active' } }),
    ]);

    const ctx: CdsContext = {
      ageYears: this.ageYears(patient.dateOfBirth),
      sex: patient.gender ?? null,
      problems: problems.map((p) => ({
        code: p.code ?? null,
        display: p.display ?? p.code ?? '',
        status: p.status,
      })),
      allergies: allergies.map((a) => ({
        display: a.allergenName,
        componentCode: a.hptCode ?? null,
        severity: a.severity ?? null,
      })),
      vitals: await this.latestVitals(facilityId, patientId),
      labs: await this.latestLabs(facilityId, patientId),
      pregnancy: await this.pregnancyContext(facilityId, pregnancy),
      proposedDrug: await this.proposedDrug(facilityId, opts),
    };

    return {
      patientId,
      advice: evaluate(ctx),
      context: {
        ageYears: ctx.ageYears,
        problems: ctx.problems.length,
        allergies: ctx.allergies.length,
        labs: ctx.labs.length,
        hasVitals: !!ctx.vitals,
        pregnancy: !!ctx.pregnancy?.active,
      },
      dataSources: DATA_SOURCES_USED,
    };
  }

  private ageYears(dob?: string | null): number | null {
    if (!dob) return null;
    const born = new Date(dob);
    if (Number.isNaN(born.getTime())) return null;
    return Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  /** The most recent triage observations, with BMI worked out rather than typed. */
  private async latestVitals(facilityId: string, patientId: string): Promise<CdsContext['vitals']> {
    const visits = await this.visits.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const visit = visits.find((v) => v.triageData && Object.keys(v.triageData).length);
    const t = visit?.triageData;
    if (!t) return null;

    // Blood pressure is stored as "120/80".
    const [sys, dia] = String(t.bloodPressure ?? '').split('/');
    const weight = num(t.weight);
    const height = num(t.height);

    return {
      systolic: num(sys),
      diastolic: num(dia),
      temperature: num(t.temperature),
      pulse: num(t.pulse),
      weightKg: weight,
      heightCm: height,
      bmi: t.bmi ?? (weight != null && height != null ? (bmiFrom(weight, height)?.value ?? null) : null),
      recordedAt: visit?.triagedAt ? new Date(visit.triagedAt).toISOString() : null,
    };
  }

  /**
   * The most recent value for each analyte. Only resulted values are read — a
   * pending order is not a result, and treating it as one would be worse than
   * having no result at all.
   */
  private async latestLabs(facilityId: string, patientId: string): Promise<CdsLab[]> {
    const orders = await this.labOrders.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
      take: 40,
    });
    if (!orders.length) return [];

    const analyteIds = [
      ...new Set(
        orders.flatMap((o) =>
          (o.items ?? []).flatMap((i) => (i.results ?? []).map((r) => r.analyteId).filter((x): x is string => !!x)),
        ),
      ),
    ];
    const analytes = analyteIds.length ? await this.analytes.find({ where: { id: In(analyteIds) } }) : [];
    const loincById = new Map(analytes.map((a) => [a.id, a.loincCode]));

    const latest = new Map<string, CdsLab>();
    for (const order of orders) {
      for (const item of order.items ?? []) {
        for (const r of item.results ?? []) {
          const key = r.analyteId ?? r.analyteName;
          if (!key || latest.has(key)) continue; // orders came back newest first
          const value = num(r.value);
          if (value == null) continue;
          latest.set(key, {
            loinc: r.analyteId ? (loincById.get(r.analyteId) ?? null) : null,
            name: r.analyteName,
            value,
            unit: r.unit ?? null,
            takenAt: item.resultedAt ? new Date(item.resultedAt).toISOString() : null,
          });
        }
      }
    }
    return [...latest.values()];
  }

  private async pregnancyContext(
    facilityId: string,
    pregnancy: Pregnancy | null,
  ): Promise<CdsContext['pregnancy']> {
    if (!pregnancy) return null;
    const contacts = await this.ancContacts.find({
      where: { facilityId, pregnancyId: pregnancy.id },
    });
    const g = gestationOn(pregnancy, today());
    return {
      active: true,
      gestationWeeks: g?.weeks ?? null,
      aspirinGiven: contacts.some((c) => c.aspirinGiven),
      calciumGiven: contacts.some((c) => c.calciumGiven),
      ifasGiven: contacts.some((c) => c.ifasGiven),
      dewormingGiven: contacts.some((c) => c.dewormingGiven),
      para: pregnancy.para,
      profileHb: num(pregnancy.profileHb),
    };
  }

  private async proposedDrug(
    facilityId: string,
    opts: { itemId?: string; drugName?: string },
  ): Promise<CdsDrug | null> {
    if (opts.itemId) {
      const item = await this.items.findOne({ where: { id: opts.itemId, facilityId } });
      if (item) {
        return {
          name: item.name,
          componentCode: item.activeComponentCode ?? null,
          // The KNHTS name carries the active component where the item was
          // imported from the registry; it is what a class rule matches on.
          componentName: item.knhtsName ?? null,
        };
      }
    }
    if (opts.drugName?.trim()) return { name: opts.drugName.trim() };
    return null;
  }
}
