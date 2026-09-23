import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { heightInMetres, weightInKg } from '../common/clinical/anthropometry';
import {
  GrowthFlag,
  ageInMonths,
  classify,
  weightForLengthIndicator,
  zScore,
} from './growth';
import { GrowthIndicator, Sex, tableFor } from './data/who-standards';

export interface GrowthPoint {
  date: string;
  ageMonths: number;
  weightKg: number | null;
  heightCm: number | null;
  /** Null where the child is outside the range WHO publishes. */
  wfa: { z: number; flag: GrowthFlag } | null;
  hfa: { z: number; flag: GrowthFlag } | null;
  wfl: { z: number; flag: GrowthFlag; indicator: GrowthIndicator } | null;
}

export interface GrowthSeries {
  patientId: string;
  sex: Sex | null;
  dateOfBirth: string | null;
  /** WHO's standards stop at five years; beyond that we report nothing. */
  inRange: boolean;
  points: GrowthPoint[];
  latest: GrowthPoint | null;
}

@Injectable()
export class GrowthService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientVisit) private readonly visits: Repository<PatientVisit>,
  ) {}

  private sexOf(gender?: string | null): Sex | null {
    const g = (gender ?? '').trim().toLowerCase();
    if (g.startsWith('m')) return 'M';
    if (g.startsWith('f')) return 'F';
    // Without a sex there is no reference to read against; say so rather than pick one.
    return null;
  }

  /**
   * A child's growth over time, built from the weights and heights already
   * recorded at triage — no separate data entry, and no measurement exists
   * here that a clinician did not take.
   */
  async series(facilityId: string, patientId: string): Promise<GrowthSeries> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const sex = this.sexOf(patient.gender);
    const dob = patient.dateOfBirth ?? null;
    const base: GrowthSeries = {
      patientId,
      sex,
      dateOfBirth: dob,
      inRange: false,
      points: [],
      latest: null,
    };
    if (!sex || !dob) return base;

    const visits = await this.visits.find({
      where: { facilityId, patientId },
      order: { createdAt: 'ASC' },
    });

    const points: GrowthPoint[] = [];
    for (const v of visits) {
      const t = v.triageData;
      if (!t) continue;
      const weight = weightInKg(t.weight);
      const heightM = heightInMetres(t.height);
      if (weight == null && heightM == null) continue;

      const takenOn = (v.triagedAt ?? v.createdAt) as Date;
      const months = ageInMonths(dob, takenOn);
      if (months == null) continue;
      const heightCm = heightM != null ? Math.round(heightM * 1000) / 10 : null;

      const wfa = weight != null ? zScore('wfa', sex, months, weight) : null;
      const hfa = heightCm != null ? zScore('hfa', sex, months, heightCm) : null;
      const wflIndicator = weightForLengthIndicator(months);
      const wfl = weight != null && heightCm != null ? zScore(wflIndicator, sex, heightCm, weight) : null;

      points.push({
        date: new Date(takenOn).toISOString().slice(0, 10),
        ageMonths: months,
        weightKg: weight,
        heightCm,
        wfa: wfa ? { z: wfa.z, flag: classify('wfa', wfa.z) } : null,
        hfa: hfa ? { z: hfa.z, flag: classify('hfa', hfa.z) } : null,
        wfl: wfl ? { z: wfl.z, flag: classify(wflIndicator, wfl.z), indicator: wflIndicator } : null,
      });
    }

    return {
      ...base,
      inRange: points.some((p) => p.wfa || p.hfa || p.wfl),
      points,
      latest: points.length ? points[points.length - 1] : null,
    };
  }

  /**
   * The reference curves themselves, so a chart can be drawn against the real
   * standard rather than a redrawn approximation of it.
   */
  referenceCurves(indicator: GrowthIndicator, sex: Sex) {
    const table = tableFor(indicator, sex);
    if (!table) return null;
    const rows = Object.entries(table)
      .map(([key, [L, M, S, sd3neg, sd2neg, sd2pos, sd3pos]]) => ({
        key: Number(key),
        median: M,
        sd3neg,
        sd2neg,
        sd2pos,
        sd3pos,
        // Kept so a client can compute a z-score without another round trip.
        L,
        S,
      }))
      .sort((a, b) => a.key - b.key);
    return { indicator, sex, rows };
  }
}
