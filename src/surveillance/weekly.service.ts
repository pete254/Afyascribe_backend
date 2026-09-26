import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WeeklyReturn, WeeklyReturnRow } from './entities/weekly-return.entity';
import { DiseaseNotification } from './entities/disease-notification.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { AGE_SPLIT_YEARS, MOH505_LAB_SECTIONS, MOH505_ROWS, MOH505_SOURCE, emptyCounts } from './data/moh505';
import { EpiWeek, epiWeekOf, inWeek, lastCompleteWeek, weekBounds } from './epiweek';
import { CurrentUserType } from '../common/decorators/current-user.decorator';
import { PublicHealthSignal } from './entities/public-health-signal.entity';
import { THRESHOLD_SOURCE, evaluateWeek } from './thresholds';
import { IDSR_CONDITIONS } from './data/idsr';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

@Injectable()
export class WeeklyReturnService {
  constructor(
    @InjectRepository(WeeklyReturn) private readonly returns: Repository<WeeklyReturn>,
    @InjectRepository(PublicHealthSignal) private readonly signals: Repository<PublicHealthSignal>,
    @InjectRepository(DiseaseNotification)
    private readonly notifications: Repository<DiseaseNotification>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(Birth) private readonly births: Repository<Birth>,
    @InjectRepository(Facility) private readonly facilities: Repository<Facility>,
    private readonly config: ConfigService,
  ) {}

  private name(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || null;
  }

  private resolveWeek(year?: number, week?: number): EpiWeek {
    if (year && week) {
      const bounds = weekBounds(year, week);
      if (!bounds) throw new BadRequestException(`There is no week ${week} in ${year}`);
      return { year, week, ...bounds };
    }
    return lastCompleteWeek();
  }

  /**
   * Work the week out from the record.
   *
   * Cases come from notifications whose onset falls in the week — not from
   * when the form happened to be filled, since a case seen on Sunday and
   * written up on Tuesday belongs to Sunday's week.
   *
   * Deaths come from the patient status recorded on the notification, except
   * maternal and neonatal deaths, which are counted from the maternity and
   * newborn registers. Those two are not text-matched anywhere, so there is no
   * double counting.
   */
  async compute(facilityId: string, year?: number, week?: number) {
    const epi = this.resolveWeek(year, week);
    const bounds = { start: epi.start, end: epi.end };

    // Only cases someone stood behind. A suggestion nobody acted on is not a
    // case, and counting it would inflate the return with the detector's
    // guesses.
    const notified = await this.notifications.find({
      where: { facilityId, status: 'notified' },
    });
    const inScope = notified.filter((n) => inWeek(n.onsetDate ?? n.createdAt.toISOString(), bounds));

    const patients = inScope.length
      ? await this.patients.find({ where: { id: In([...new Set(inScope.map((n) => n.patientId))]) } })
      : [];
    const dobById = new Map(patients.map((p) => [p.id, p.dateOfBirth]));

    const isUnder5 = (n: DiseaseNotification): boolean => {
      const dob = dobById.get(n.patientId);
      const on = n.onsetDate ?? n.createdAt.toISOString().slice(0, 10);
      if (!dob) return false; // Unknown age counts with the adults, as the form has no third column.
      const years = (new Date(on).getTime() - new Date(dob).getTime()) / YEAR_MS;
      return years >= 0 && years < AGE_SPLIT_YEARS;
    };

    const tally = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const n of inScope) {
      const counts = tally.get(n.conditionCode) ?? emptyCounts();
      const under5 = isUnder5(n);
      const died = n.patientStatus === 'dead';
      if (under5) {
        counts.under5Cases += 1;
        if (died) counts.under5Deaths += 1;
      } else {
        counts.over5Cases += 1;
        if (died) counts.over5Deaths += 1;
      }
      tally.set(n.conditionCode, counts);
    }

    // Maternal deaths from the maternity register: a woman who died in or
    // after a delivery in this week. Always counted as five and over.
    const deliveries = await this.deliveries.find({
      where: { facilityId, maternalOutcome: 'died' },
    });
    const maternal = deliveries.filter((d) =>
      inWeek(d.maternalDischargedAt?.toISOString() ?? d.deliveredAt?.toISOString(), bounds),
    ).length;
    if (maternal) {
      const counts = emptyCounts();
      counts.over5Cases = maternal;
      counts.over5Deaths = maternal;
      tally.set('MATERNAL_DEATH', counts);
    }

    // Neonatal deaths from the newborn register. Always under five.
    const babies = await this.births.find({ where: { facilityId, dischargeStatus: 'died' } });
    const neonatal = babies.filter((b) =>
      inWeek(b.dischargedAt?.toISOString() ?? b.bornAt?.toISOString(), bounds),
    ).length;
    if (neonatal) {
      const counts = emptyCounts();
      counts.under5Cases = neonatal;
      counts.under5Deaths = neonatal;
      tally.set('NEONATAL_DEATH', counts);
    }

    const rows: WeeklyReturnRow[] = MOH505_ROWS.map((row) => {
      if (row.deathsOf) {
        // "Deaths due to Malaria" repeats the malaria deaths on its own row.
        const from = tally.get(row.deathsOf) ?? emptyCounts();
        return {
          label: row.label,
          conditionCode: null,
          computed: true,
          under5Cases: from.under5Deaths,
          under5Deaths: from.under5Deaths,
          over5Cases: from.over5Deaths,
          over5Deaths: from.over5Deaths,
        };
      }
      const counts = (row.conditionCode ? tally.get(row.conditionCode) : null) ?? emptyCounts();
      return { label: row.label, conditionCode: row.conditionCode, computed: true, ...counts };
    });

    return {
      ...epi,
      rows,
      labSections: MOH505_LAB_SECTIONS,
      source: MOH505_SOURCE,
      /** How many notified cases the week's figures rest on. */
      casesCounted: inScope.length,
    };
  }

  /** The stored return for a week, computing a draft if there is none yet. */
  async forWeek(facilityId: string, year?: number, week?: number) {
    const epi = this.resolveWeek(year, week);
    const existing = await this.returns.findOne({
      where: { facilityId, year: epi.year, week: epi.week },
    });
    const computed = await this.compute(facilityId, epi.year, epi.week);

    if (!existing) return { ...computed, stored: null as WeeklyReturn | null };

    // A submitted return keeps what was submitted; a draft is refreshed from
    // the record, since cases recorded since it was opened belong in it.
    return {
      ...computed,
      rows: existing.status === 'submitted' ? existing.rows : this.merge(computed.rows, existing.rows),
      stored: existing,
    };
  }

  /** Keep a corrected figure; refresh the rest from the record. */
  private merge(computed: WeeklyReturnRow[], stored: WeeklyReturnRow[]): WeeklyReturnRow[] {
    const byLabel = new Map(stored.map((r) => [r.label, r]));
    return computed.map((row) => {
      const kept = byLabel.get(row.label);
      return kept && !kept.computed ? kept : row;
    });
  }

  /** Save a draft, marking any figure a person changed. */
  async saveDraft(
    facilityId: string,
    input: {
      year?: number;
      week?: number;
      rows?: WeeklyReturnRow[];
      labSurveillance?: Record<string, Record<string, number>>;
      others?: WeeklyReturn['others'];
      sitesReported?: number;
      sitesExpected?: number;
      reportedByDesignation?: string;
      notes?: string;
    },
    user?: CurrentUserType,
  ): Promise<WeeklyReturn> {
    const epi = this.resolveWeek(input.year, input.week);
    const computed = await this.compute(facilityId, epi.year, epi.week);

    const existing = await this.returns.findOne({
      where: { facilityId, year: epi.year, week: epi.week },
    });
    if (existing?.status === 'submitted') {
      throw new BadRequestException('This week has been submitted. Record a correction with the sub-county instead.');
    }

    // A row that differs from what the record says was changed by a person,
    // and the return should say so.
    const rows = (input.rows ?? computed.rows).map((row) => {
      const auto = computed.rows.find((r) => r.label === row.label);
      const same =
        auto &&
        auto.under5Cases === row.under5Cases &&
        auto.under5Deaths === row.under5Deaths &&
        auto.over5Cases === row.over5Cases &&
        auto.over5Deaths === row.over5Deaths;
      return { ...row, computed: !!same };
    });

    const entity =
      existing ??
      this.returns.create({
        facilityId,
        year: epi.year,
        week: epi.week,
        weekStart: epi.start,
        weekEnd: epi.end,
      });

    Object.assign(entity, {
      weekStart: epi.start,
      weekEnd: epi.end,
      rows,
      labSurveillance: input.labSurveillance ?? entity.labSurveillance ?? {},
      others: input.others ?? entity.others ?? [],
      sitesReported: input.sitesReported ?? entity.sitesReported,
      sitesExpected: input.sitesExpected ?? entity.sitesExpected,
      reportedByName: this.name(user) ?? entity.reportedByName,
      reportedByDesignation: input.reportedByDesignation?.trim() || entity.reportedByDesignation,
      notes: input.notes?.trim() || entity.notes,
      status: 'draft',
    });

    return this.returns.save(entity);
  }

  /**
   * Submit the week.
   *
   * The form goes to the sub-county disease surveillance coordinator. There is
   * no national endpoint published for this, so an unconfigured system records
   * the submission and says plainly that nothing was transmitted — the return
   * still has to reach the coordinator by Monday, on paper if need be.
   */
  async submit(
    facilityId: string,
    year?: number,
    week?: number,
    user?: CurrentUserType,
  ): Promise<{ return: WeeklyReturn; transmission: { attempted: boolean; ok: boolean; detail: string } }> {
    const epi = this.resolveWeek(year, week);
    const entity = await this.returns.findOne({ where: { facilityId, year: epi.year, week: epi.week } });
    if (!entity) {
      throw new NotFoundException('Nothing saved for this week yet. Review the figures and save a draft first.');
    }

    const url = this.config.get<string>('IDSR_WEEKLY_URL') ?? this.config.get<string>('IDSR_ALERT_URL');
    let transmission = {
      attempted: false,
      ok: false,
      detail:
        'No surveillance endpoint is configured, so nothing was transmitted. The return is recorded — send it to the sub-county coordinator, and set IDSR_WEEKLY_URL to transmit automatically.',
    };

    if (url) {
      try {
        const payload = await this.exportReturn(facilityId, entity);
        const token = this.config.get<string>('IDSR_ALERT_TOKEN');
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        transmission = {
          attempted: true,
          ok: res.ok,
          detail: res.ok ? `Sent to ${url}` : `${url} responded ${res.status}`,
        };
      } catch (err) {
        transmission = { attempted: true, ok: false, detail: (err as Error).message };
      }
    }

    entity.status = 'submitted';
    entity.submittedAt = new Date();
    entity.submittedTo = url ?? null;
    entity.submissionStatus = transmission.attempted ? (transmission.ok ? 'sent' : 'failed') : 'not-configured';
    entity.reportedByName = this.name(user) ?? entity.reportedByName;

    return { return: await this.returns.save(entity), transmission };
  }

  /** The return as MOH 505, for transmission, printing or email. */
  async exportReturn(facilityId: string, entity: WeeklyReturn): Promise<Record<string, unknown>> {
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    return {
      form: MOH505_SOURCE.form,
      header: {
        county: (facility as unknown as { county?: string })?.county ?? null,
        subCounty: (facility as unknown as { subCounty?: string })?.subCounty ?? null,
        healthFacility: facility?.name ?? null,
        kmhflCode: (facility as unknown as { kmhflCode?: string })?.kmhflCode ?? null,
        epiWeek: entity.week,
        weekEnding: entity.weekEnd,
        year: entity.year,
        sitesReported: entity.sitesReported,
        sitesExpected: entity.sitesExpected,
      },
      rows: entity.rows,
      others: entity.others,
      laboratorySurveillance: entity.labSurveillance,
      reportedBy: {
        name: entity.reportedByName,
        designation: entity.reportedByDesignation,
        date: entity.submittedAt,
      },
      notes: entity.notes,
      source: MOH505_SOURCE,
    };
  }

  async exportWeek(facilityId: string, year: number, week: number): Promise<Record<string, unknown>> {
    const entity = await this.returns.findOne({ where: { facilityId, year, week } });
    if (!entity) throw new NotFoundException('Nothing saved for this week');
    return this.exportReturn(facilityId, entity);
  }

  /** Recent returns, so a focal person can see what has and has not gone. */
  async history(facilityId: string, limit = 12): Promise<WeeklyReturn[]> {
    return this.returns.find({
      where: { facilityId },
      order: { year: 'DESC', week: 'DESC' },
      take: Math.min(Math.max(limit, 1), 104),
    });
  }

  /** Weeks with no return at all — the ones that were never filed. */
  async missing(facilityId: string, weeks = 8): Promise<{ year: number; week: number; weekEnd: string }[]> {
    const filed = new Set((await this.returns.find({ where: { facilityId } })).map((r) => `${r.year}-${r.week}`));
    const out: { year: number; week: number; weekEnd: string }[] = [];
    let cursor = lastCompleteWeek();
    for (let i = 0; i < weeks; i += 1) {
      if (!filed.has(`${cursor.year}-${cursor.week}`)) {
        out.push({ year: cursor.year, week: cursor.week, weekEnd: cursor.end });
      }
      const previous = new Date(`${cursor.start}T00:00:00Z`).getTime() - 86_400_000;
      cursor = epiWeekOf(new Date(previous).toISOString().slice(0, 10))!;
    }
    return out;
  }

  // ── Public health events ──────────────────────────────────────────────────

  /**
   * Look at a week against the guidelines' thresholds.
   *
   * Runs over the computed figures rather than the corrected ones: a threshold
   * should be judged on what the record holds, not on a number someone typed.
   * The preceding weeks come from the record too, so a trend is a trend in
   * cases and not in paperwork.
   */
  async evaluate(facilityId: string, year?: number, week?: number, lookBackWeeks = 4) {
    const epi = this.resolveWeek(year, week);
    const current = await this.compute(facilityId, epi.year, epi.week);

    const history: { conditionCode: string; cases: number }[][] = [];
    let cursor = epi;
    for (let i = 0; i < lookBackWeeks; i += 1) {
      const previousDay = new Date(`${cursor.start}T00:00:00Z`).getTime() - 86_400_000;
      const prev = epiWeekOf(new Date(previousDay).toISOString().slice(0, 10));
      if (!prev) break;
      const computed = await this.compute(facilityId, prev.year, prev.week);
      history.push(this.asCounts(computed.rows));
      cursor = prev;
    }

    const found = evaluateWeek(IDSR_CONDITIONS, this.asCounts(current.rows), history);
    return { ...epi, signals: found, source: THRESHOLD_SOURCE, weeksCompared: history.length };
  }

  private asCounts(rows: { conditionCode: string | null; under5Cases: number; over5Cases: number }[]) {
    return rows
      .filter((r) => r.conditionCode)
      .map((r) => ({ conditionCode: r.conditionCode as string, cases: r.under5Cases + r.over5Cases }));
  }

  /**
   * Evaluate a week and keep what it found.
   *
   * A signal already recorded for the same condition, week and rule is left
   * alone: re-raising it would reset the acknowledgement, and "someone looked
   * at this" is the fact worth keeping.
   */
  async raiseSignals(facilityId: string, year?: number, week?: number): Promise<PublicHealthSignal[]> {
    const { signals: found, year: y, week: w } = await this.evaluate(facilityId, year, week);
    const existing = await this.signals.find({ where: { facilityId, year: y, week: w } });

    const out: PublicHealthSignal[] = [];
    for (const signal of found) {
      const already = existing.find(
        (e) => e.conditionCode === signal.conditionCode && e.rule === signal.rule,
      );
      if (already) {
        out.push(already);
        continue;
      }
      out.push(
        await this.signals.save(
          this.signals.create({
            facilityId,
            year: y,
            week: w,
            conditionCode: signal.conditionCode,
            conditionName: signal.conditionName,
            level: signal.level,
            rule: signal.rule,
            detail: signal.detail,
            count: signal.count,
            threshold: signal.threshold,
            published: signal.published,
            status: 'open',
          }),
        ),
      );
    }
    return out;
  }

  async listSignals(facilityId: string, status?: string): Promise<PublicHealthSignal[]> {
    const qb = this.signals
      .createQueryBuilder('s')
      .where('s.facility_id = :facilityId', { facilityId })
      .orderBy("CASE WHEN s.level = 'action' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('s.year', 'DESC')
      .addOrderBy('s.week', 'DESC');
    if (status) qb.andWhere('s.status = :status', { status });
    return qb.getMany();
  }

  /** Record that someone looked, and what they found. */
  async acknowledgeSignal(
    facilityId: string,
    id: string,
    response: string,
    close: boolean,
    user?: CurrentUserType,
  ): Promise<PublicHealthSignal> {
    const row = await this.signals.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Signal not found');
    if (!response?.trim()) {
      throw new BadRequestException('Say what was found. A signal closed without a finding records nothing.');
    }
    row.status = close ? 'closed' : 'acknowledged';
    row.response = response.trim();
    row.acknowledgedAt = new Date();
    row.acknowledgedByName = this.name(user);
    return this.signals.save(row);
  }
}