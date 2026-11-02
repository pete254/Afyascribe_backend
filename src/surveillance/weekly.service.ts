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
import { insecureEndpointReason } from '../common/outbound-url';
import { MAX_WEEKLY_COUNT } from './dto/surveillance.dto';
import type { Moh505Counts, Moh505LabKey } from './data/moh505';
import { LabFigures, countLab, labCorrections, overlayLab } from './lab-counts';
import { SendOutcome, afterAttempt, postJson } from './retry';

/** A row as a person sends it back: the label and the four figures. */
type WeeklyRowInput = Moh505Counts & { label: string; conditionCode?: string | null };

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
      /** The laboratory lines as the laboratory module counts them. */
      labComputed: await this.computeLab(facilityId, bounds),
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

    if (!existing) {
      return { ...computed, labSurveillance: computed.labComputed, stored: null as WeeklyReturn | null };
    }

    // A submitted return keeps what was submitted; a draft is refreshed from
    // the record, since cases recorded since it was opened belong in it.
    const submitted = existing.status === 'submitted';
    return {
      ...computed,
      rows: submitted ? existing.rows : this.merge(computed.rows, existing.rows),
      labSurveillance: submitted
        ? existing.labSurveillance
        : overlayLab(computed.labComputed, existing.labSurveillance),
      stored: existing,
    };
  }

  /**
   * The MOH 505 laboratory lines from the laboratory module, for the tests the
   * facility has marked (lab_tests.moh505_lab). Days are Nairobi days, so a
   * result released at 01:00 on Monday belongs to Monday.
   */
  async computeLab(facilityId: string, bounds: { start: string; end: string }): Promise<LabFigures> {
    const rows: { line: Moh505LabKey; collected: boolean; released: boolean; positive: boolean }[] =
      await this.returns.manager.query(
        `SELECT t.moh505_lab AS line,
                (i.collected_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $2::date AND $3::date AS collected,
                (i.status = 'released'
                  AND (i.resulted_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $2::date AND $3::date) AS released,
                EXISTS (SELECT 1 FROM lab_result_values v
                         WHERE v.order_item_id = i.id AND v.flag IN ('abnormal', 'high')) AS positive
           FROM lab_order_items i
           JOIN lab_orders o ON o.id = i.order_id
           JOIN lab_tests t ON t.id = i.lab_test_id
          WHERE o.facility_id = $1
            AND t.moh505_lab IS NOT NULL
            AND i.status <> 'cancelled'
            AND ((i.collected_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $2::date AND $3::date
              OR (i.resulted_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $2::date AND $3::date)`,
        [facilityId, bounds.start, bounds.end],
      );
    return countLab(
      rows.map((x) => ({
        line: x.line,
        collectedInWeek: !!x.collected,
        releasedInWeek: !!x.released,
        positive: !!x.positive,
      })),
    );
  }

  /** Keep a corrected figure; refresh the rest from the record. */
  private merge(computed: WeeklyReturnRow[], stored: WeeklyReturnRow[]): WeeklyReturnRow[] {
    const byLabel = new Map(stored.map((r) => [r.label, r]));
    return computed.map((row) => {
      const kept = byLabel.get(row.label);
      return kept && !kept.computed ? kept : row;
    });
  }

  /**
   * What request validation cannot see: a row must be one the form prints, and
   * the laboratory figures (a free-form map) must be counts too. A figure the
   * sub-county receives is a figure someone acts on.
   */
  private checkFigures(
    input: { rows?: WeeklyRowInput[]; labSurveillance?: Record<string, Record<string, number>> },
    formRows: WeeklyReturnRow[],
  ) {
    const labels = new Set(formRows.map((r) => r.label));
    const seen = new Set<string>();
    for (const row of input.rows ?? []) {
      if (!labels.has(row.label)) {
        throw new BadRequestException(`"${row.label}" is not a row on MOH 505.`);
      }
      if (seen.has(row.label)) throw new BadRequestException(`"${row.label}" appears twice.`);
      seen.add(row.label);
    }
    for (const [test, fields] of Object.entries(input.labSurveillance ?? {})) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new BadRequestException(`Laboratory figures for "${test}" must be a set of counts.`);
      }
      for (const [field, value] of Object.entries(fields)) {
        if (!Number.isInteger(value) || value < 0 || value > MAX_WEEKLY_COUNT) {
          throw new BadRequestException(
            `Laboratory "${test}" — "${field}" must be a whole number from 0 to ${MAX_WEEKLY_COUNT}.`,
          );
        }
      }
    }
  }

  /** Save a draft, marking any figure a person changed. */
  async saveDraft(
    facilityId: string,
    input: {
      year?: number;
      week?: number;
      rows?: WeeklyRowInput[];
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

    this.checkFigures(input, computed.rows);

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
      // The form decides which condition a row is, not the request.
      return {
        ...row,
        conditionCode: auto?.conditionCode ?? row.conditionCode ?? null,
        computed: !!same,
      };
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
      // Only what a person changed is kept; the rest is counted afresh.
      labSurveillance:
        input.labSurveillance !== undefined
          ? labCorrections(computed.labComputed, input.labSurveillance)
          : (entity.labSurveillance ?? {}),
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
  ): Promise<{ return: WeeklyReturn; transmission: SendOutcome }> {
    const epi = this.resolveWeek(year, week);
    const entity = await this.returns.findOne({ where: { facilityId, year: epi.year, week: epi.week } });
    if (!entity) {
      throw new NotFoundException('Nothing saved for this week yet. Review the figures and save a draft first.');
    }

    // Freeze what is on screen now, not what the draft held when last saved:
    // a case notified since then belongs in the week. Submitting again after a
    // failure resends the frozen figures unchanged.
    if (entity.status !== 'submitted') {
      const computed = await this.compute(facilityId, epi.year, epi.week);
      entity.rows = this.merge(computed.rows, entity.rows);
      entity.labSurveillance = overlayLab(computed.labComputed, entity.labSurveillance);
      entity.status = 'submitted';
      entity.submittedAt = new Date();
      entity.reportedByName = this.name(user) ?? entity.reportedByName;
    }

    const transmission = await this.transmit(facilityId, entity);
    return { return: await this.returns.save(entity), transmission };
  }

  /**
   * Send a submitted return and record how it went, including when to try
   * again. Used by Submit and by the retry job.
   */
  async transmit(facilityId: string, entity: WeeklyReturn): Promise<SendOutcome> {
    const weeklyUrl = this.config.get<string>('IDSR_WEEKLY_URL');
    const url = weeklyUrl || this.config.get<string>('IDSR_ALERT_URL');
    let outcome: SendOutcome;
    if (!url) {
      outcome = {
        attempted: false,
        ok: false,
        detail:
          'No surveillance endpoint is configured, so nothing was transmitted. The return is recorded — send it to the sub-county coordinator, and set IDSR_WEEKLY_URL to transmit automatically.',
      };
    } else {
      const insecure = insecureEndpointReason(url, weeklyUrl ? 'IDSR_WEEKLY_URL' : 'IDSR_ALERT_URL');
      outcome = insecure
        ? { attempted: false, ok: false, detail: `${insecure} The return is recorded — send it to the sub-county coordinator.` }
        : await postJson(url, await this.exportReturn(facilityId, entity), this.config.get<string>('IDSR_ALERT_TOKEN'));
    }

    const next = afterAttempt(entity.submissionAttempts ?? 0, outcome);
    entity.submittedTo = url ?? null;
    entity.submissionStatus = next.status;
    entity.submissionAttempts = next.attempts;
    entity.nextSubmissionAt = next.nextAt;
    entity.submissionError = next.error;
    if (next.status === 'sent') entity.submissionEscalatedAt = null;
    return outcome;
  }

  /** Returns whose retry is due, for the retry job. */
  dueForResend(now: Date = new Date()): Promise<WeeklyReturn[]> {
    return this.returns
      .createQueryBuilder('r')
      .where('r.next_submission_at IS NOT NULL AND r.next_submission_at <= :now', { now })
      .andWhere("r.status = 'submitted'")
      .orderBy('r.next_submission_at', 'ASC')
      .take(50)
      .getMany();
  }

  /** Resend one return; the retry job's step. */
  async resend(entity: WeeklyReturn): Promise<WeeklyReturn> {
    await this.transmit(entity.facilityId, entity);
    return this.returns.save(entity);
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