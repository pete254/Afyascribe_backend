import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { PncContact } from '../maternity/entities/pnc-contact.entity';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { QualityMeasure } from './entities/quality-measure.entity';
import { MeasureValue } from './entities/measure-value.entity';
import { MeasureDefinition, MeasureResult, result, toCsv, toMeasureReport } from './quality';
import { BUILT_IN_MEASURES, MEASURE_BY_ID } from './data/measures';
import { gestationOn } from '../maternity/gestation';

/** The canonical base for this system's own measure identifiers. */
const MEASURE_SYSTEM = 'https://afyascribe.health/Measure';

@Injectable()
export class QualityService {
  constructor(
    @InjectRepository(Pregnancy) private readonly pregnancies: Repository<Pregnancy>,
    @InjectRepository(AncContact) private readonly ancContacts: Repository<AncContact>,
    @InjectRepository(PncContact) private readonly pncContacts: Repository<PncContact>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(Birth) private readonly births: Repository<Birth>,
    @InjectRepository(Facility) private readonly facilities: Repository<Facility>,
    @InjectRepository(QualityMeasure) private readonly measures: Repository<QualityMeasure>,
    @InjectRepository(MeasureValue) private readonly values: Repository<MeasureValue>,
    private readonly config: ConfigService,
  ) {}

  /** Built-in definitions plus anything imported, as one catalogue. */
  async definitions(facilityId: string): Promise<MeasureDefinition[]> {
    const imported = await this.measures.find({ where: { facilityId } });
    return [
      ...BUILT_IN_MEASURES,
      ...imported.map((m) => ({
        id: m.measureId,
        title: m.title,
        description: m.description ?? '',
        numerator: m.numerator,
        denominator: m.denominator,
        improvement: m.improvement,
        scoring: m.scoring,
        category: m.category ?? 'Imported',
        provenance: m.provenance,
        nationalIndicator: m.nationalIndicator,
      })),
    ];
  }

  // ── Calculation ───────────────────────────────────────────────────────────

  /**
   * Work out every built-in measure for a period.
   *
   * Imported measures are not calculated — this system has no way to execute
   * someone else's criteria, and a number produced by guessing at them would
   * be worse than no number. They are captured instead.
   */
  async calculate(facilityId: string, from: string, to: string): Promise<MeasureResult[]> {
    const period = Between(from, to);

    const [pregnancies, deliveries, births] = await Promise.all([
      this.pregnancies.find({ where: { facilityId } }),
      this.deliveries.find({ where: { facilityId } }),
      this.births.find({ where: { facilityId } }),
    ]);

    const pregnancyIds = pregnancies.map((p) => p.id);
    const [contacts, pncVisits] = pregnancyIds.length
      ? await Promise.all([
          this.ancContacts.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
          this.pncContacts.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
        ])
      : [[], []];
    void period;

    const inPeriod = (d?: string | Date | null) => {
      if (!d) return false;
      const iso = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
      return iso >= from && iso <= to;
    };

    const contactsOf = (pid: string) => contacts.filter((c) => c.pregnancyId === pid);
    const def = (id: string) => MEASURE_BY_ID.get(id)!;
    const out: MeasureResult[] = [];

    // ── Antenatal ───────────────────────────────────────────────────────────
    const firstContacts = contacts.filter((c) => c.contactNumber === 1 && inPeriod(c.contactDate));
    const earlyBooking = firstContacts.filter((c) => c.gestationDays != null && c.gestationDays < 13 * 7);
    out.push(
      result(
        def('anc-first-contact-first-trimester'),
        from,
        to,
        earlyBooking.length,
        firstContacts.length,
      ),
    );

    const ended = pregnancies.filter((p) => p.status === 'ended' && inPeriod(p.outcomeDate));
    const withAtLeast = (n: number) => ended.filter((p) => contactsOf(p.id).length >= n).length;
    out.push(result(def('anc-four-plus-contacts'), from, to, withAtLeast(4), ended.length));
    out.push(result(def('anc-eight-contacts'), from, to, withAtLeast(8), ended.length));

    // Pregnancies seen at all in the period — the denominator for what should
    // have been given at a contact.
    const seen = [...new Set(contacts.filter((c) => inPeriod(c.contactDate)).map((c) => c.pregnancyId))];
    const seenPregnancies = pregnancies.filter((p) => seen.includes(p.id));
    out.push(
      result(
        def('anc-ifas'),
        from,
        to,
        seen.filter((pid) => contactsOf(pid).some((c) => c.ifasGiven)).length,
        seen.length,
      ),
    );

    const profileComplete = (p: Pregnancy) =>
      !!p.profileHb &&
      !!p.profileBloodGroup &&
      !!p.profileUrinalysis &&
      !!p.profileRbs &&
      !!p.profileSyphilis &&
      !!p.profileHepB &&
      !!p.profileHiv &&
      !!p.profileTb;
    out.push(
      result(
        def('anc-profile-complete'),
        from,
        to,
        seenPregnancies.filter(profileComplete).length,
        seenPregnancies.length,
      ),
    );

    // ── Delivery ────────────────────────────────────────────────────────────
    const delivered = deliveries.filter((d) => inPeriod(d.deliveredAt));
    out.push(result(def('delivery-amtsl'), from, to, delivered.filter((d) => d.amtslGiven).length, delivered.length));
    out.push(
      result(
        def('delivery-skilled-attendant'),
        from,
        to,
        delivered.filter((d) => !!d.conductedByName?.trim()).length,
        delivered.length,
      ),
    );
    out.push(
      result(
        def('maternal-deaths'),
        from,
        to,
        delivered.filter((d) => d.maternalOutcome === 'died').length,
        null,
      ),
    );

    // ── Newborn ─────────────────────────────────────────────────────────────
    const born = births.filter((b) => inPeriod(b.bornAt));
    const live = born.filter((b) => b.outcome === 'live-birth');
    const weighed = live.filter((b) => b.birthWeightGrams != null);
    out.push(
      result(
        def('low-birth-weight'),
        from,
        to,
        weighed.filter((b) => (b.birthWeightGrams ?? 0) < 2500).length,
        weighed.length,
      ),
    );
    out.push(
      result(
        def('stillbirth-rate'),
        from,
        to,
        born.filter((b) => b.outcome !== 'live-birth').length,
        born.length,
      ),
    );
    out.push(
      result(
        def('breastfeeding-within-hour'),
        from,
        to,
        live.filter((b) => b.breastfedWithinHour === true).length,
        live.length,
      ),
    );

    // ── Postnatal ───────────────────────────────────────────────────────────
    // Only births after which postnatal care applies, which is what the
    // maternity module already decides.
    const pncEligible = pregnancies.filter(
      (p) => inPeriod(p.outcomeDate) && (p.outcome === 'live-birth' || p.outcome === 'stillbirth'),
    );
    out.push(
      result(
        def('pnc-within-48h'),
        from,
        to,
        pncEligible.filter((p) =>
          pncVisits.some((v) => v.pregnancyId === p.id && v.window === 'within-48h'),
        ).length,
        pncEligible.length,
      ),
    );

    void gestationOn;
    return out;
  }

  /** Calculate and store, so a period can be read back and submitted later. */
  async calculateAndStore(
    facilityId: string,
    from: string,
    to: string,
    recordedByName?: string | null,
  ): Promise<MeasureResult[]> {
    const results = await this.calculate(facilityId, from, to);
    for (const r of results) {
      const existing = await this.values.findOne({
        where: { facilityId, measureId: r.measureId, periodStart: from },
      });
      // A recalculated period replaces its previous figure; the audit ledger
      // keeps the fact that it was recalculated.
      const row = existing ?? this.values.create({ facilityId, measureId: r.measureId, periodStart: from });
      Object.assign(row, {
        periodEnd: to,
        numerator: r.numerator ?? 0,
        denominator: r.denominator,
        rate: r.rate == null ? null : String(r.rate),
        calculated: true,
        note: r.note ?? null,
        recordedByName: recordedByName ?? null,
      });
      await this.values.save(row);
    }
    return results;
  }

  // ── Capture ───────────────────────────────────────────────────────────────

  /** Record a value by hand, for a measure this system cannot work out. */
  async capture(
    facilityId: string,
    input: {
      measureId: string;
      periodStart: string;
      periodEnd: string;
      numerator: number;
      denominator?: number | null;
      note?: string;
    },
    recordedByName?: string | null,
  ): Promise<MeasureValue> {
    if (MEASURE_BY_ID.has(input.measureId)) {
      throw new BadRequestException(
        'This measure is calculated from the record. Recalculate the period instead of entering a figure by hand.',
      );
    }
    const known = await this.measures.findOne({ where: { facilityId, measureId: input.measureId } });
    if (!known) throw new NotFoundException('No such measure. Import its definition first.');

    const existing = await this.values.findOne({
      where: { facilityId, measureId: input.measureId, periodStart: input.periodStart },
    });
    const row = existing ?? this.values.create({ facilityId, measureId: input.measureId, periodStart: input.periodStart });
    const den = input.denominator ?? null;
    Object.assign(row, {
      periodEnd: input.periodEnd,
      numerator: input.numerator,
      denominator: den,
      rate: den && den > 0 ? String(Math.round((input.numerator / den) * 1000) / 10) : null,
      calculated: false,
      note: input.note?.trim() || null,
      recordedByName: recordedByName ?? null,
    });
    return this.values.save(row);
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Bring in a measure definition.
   *
   * Accepts a FHIR Measure or this system's own shape; either way the document
   * as it arrived is kept whole, so nothing is lost by the translation.
   */
  async importMeasure(
    facilityId: string,
    doc: Record<string, any>,
    importedByName?: string | null,
  ): Promise<QualityMeasure> {
    const isFhir = doc?.resourceType === 'Measure';
    const measureId = String(doc?.id ?? doc?.measureId ?? '').trim();
    if (!measureId) throw new BadRequestException('The definition needs an id');

    const title = String(doc?.title ?? doc?.name ?? measureId);
    const populations = isFhir ? (doc.group?.[0]?.population ?? []) : [];
    const popText = (code: string): string => {
      const p = populations.find(
        (x: any) => x?.code?.coding?.some((c: any) => c?.code === code) || x?.code?.text === code,
      );
      return String(p?.description ?? p?.criteria?.expression ?? '').trim();
    };

    const numerator = String(doc?.numerator ?? popText('numerator') ?? '').trim();
    const denominator = String(doc?.denominator ?? popText('denominator') ?? '').trim();
    if (!numerator) {
      throw new BadRequestException(
        'The definition must say who is counted in the numerator. A measure without stated populations cannot be reported against honestly.',
      );
    }

    const existing = await this.measures.findOne({ where: { facilityId, measureId } });
    const row = existing ?? this.measures.create({ facilityId, measureId });
    Object.assign(row, {
      title,
      description: String(doc?.description ?? '').trim() || null,
      numerator,
      denominator: denominator || 'Not stated',
      scoring: denominator ? 'proportion' : 'count',
      improvement: doc?.improvement === 'decrease' ? 'decrease' : 'increase',
      category: String(doc?.category ?? doc?.subtitle ?? 'Imported').trim() || 'Imported',
      provenance: 'imported',
      nationalIndicator: doc?.nationalIndicator ?? doc?.identifier?.[0]?.value ?? null,
      sourceDocument: doc,
      importedByName: importedByName ?? null,
    });
    return this.measures.save(row);
  }

  // ── Export and submission ─────────────────────────────────────────────────

  async stored(facilityId: string, from: string, to: string): Promise<MeasureValue[]> {
    return this.values.find({
      where: { facilityId, periodStart: Between(from, to) },
      order: { periodStart: 'DESC', measureId: 'ASC' },
    });
  }

  /** The period as FHIR MeasureReports, one per measure. */
  async exportFhir(facilityId: string, from: string, to: string): Promise<Record<string, any>> {
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const defs = new Map((await this.definitions(facilityId)).map((d) => [d.id, d]));
    const results = await this.calculate(facilityId, from, to);

    const reports = results
      .filter((r) => defs.has(r.measureId))
      .map((r) =>
        toMeasureReport(r, defs.get(r.measureId)!, { id: facilityId, name: facility?.name }, MEASURE_SYSTEM),
      );

    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: reports.length,
      entry: reports.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
    };
  }

  async exportCsv(facilityId: string, from: string, to: string): Promise<string> {
    const defs = new Map((await this.definitions(facilityId)).map((d) => [d.id, d]));
    return toCsv(await this.calculate(facilityId, from, to), defs);
  }

  /**
   * Send the period's reports on.
   *
   * The destination is configured, not hard-coded: the Ministry's endpoint for
   * indicator submission is not published in the HIE documentation, and
   * inventing one would produce a feature that silently fails.
   */
  async submit(
    facilityId: string,
    from: string,
    to: string,
  ): Promise<{ submittedTo: string; status: number; body: unknown }> {
    const endpoint = this.config.get<string>('QUALITY_SUBMIT_URL');
    if (!endpoint) {
      throw new BadRequestException(
        'No submission endpoint is configured. Set QUALITY_SUBMIT_URL once the Ministry has given you one; the period can be exported as FHIR or CSV in the meantime.',
      );
    }

    const bundle = await this.exportFhir(facilityId, from, to);
    const token = this.config.get<string>('QUALITY_SUBMIT_TOKEN');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(bundle),
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }

    // Record the outcome against every value in the period, so what was sent
    // and when is answerable later.
    const rows = await this.values.find({ where: { facilityId, periodStart: from } });
    for (const row of rows) {
      row.submittedAt = new Date();
      row.submittedTo = endpoint;
      row.submissionStatus = res.ok ? 'accepted' : `failed (${res.status})`;
      await this.values.save(row);
    }

    return { submittedTo: endpoint, status: res.status, body };
  }
}
