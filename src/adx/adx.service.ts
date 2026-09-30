import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facility } from '../facilities/entities/facility.entity';
import { ReportsService } from '../reports/reports.service';
import { WeeklyReturnService } from '../surveillance/weekly.service';
import { weekBounds } from '../surveillance/epiweek';
import { MOH505_ROWS } from '../surveillance/data/moh505';
import {
  ADX_DATASETS,
  AdxCode,
  AdxDataSetDef,
  datasetById,
  moh505Code,
  slug,
} from './moh-datasets';
import { AdxDataValue, AdxGroup, adxPeriod, renderAdx } from './adx';
import { renderDsd } from './dsd';

/** What a caller needs to know about a message besides the XML itself. */
export interface AdxExportMeta {
  dataSet: string;
  name: string;
  orgUnit: string;
  /**
   * True where orgUnit is the facility's KMHFL code. False where it fell back
   * to our internal code, which no national system can resolve — a message is
   * still well-formed, but it cannot be loaded anywhere until the facility's
   * KMHFL code is recorded.
   */
  orgUnitIsNational: boolean;
  period: string;
  values: number;
  /** Every data element code the message actually used. */
  dataElementCodes: AdxCode[];
  /** Things a consumer should know before trusting the figures. */
  caveats: string[];
}

export interface AdxExport {
  xml: string;
  meta: AdxExportMeta;
}

/** Sex counters as the reports produce them, plus the residual. */
function sexValues(
  dataElement: string,
  total: number,
  male: number,
  female: number,
  extraDims: Record<string, string> = {},
): AdxDataValue[] {
  const unknown = total - male - female;
  const out: AdxDataValue[] = [
    { dataElement, value: male, dims: { ...extraDims, sex: 'M' } },
    { dataElement, value: female, dims: { ...extraDims, sex: 'F' } },
  ];
  // Gender is free text in the register, so a value that is neither male nor
  // female is real. Reporting it keeps the disaggregation summing to the total,
  // which a consumer is entitled to expect; omitting it would quietly lose people.
  if (unknown > 0) out.push({ dataElement, value: unknown, dims: { ...extraDims, sex: 'U' } });
  return out;
}

/**
 * Turns the MOH returns into ADX — the SDMX side of the exchange.
 *
 * The FHIR work carries one patient at a time. These returns are the other
 * kind of health data: counts for a facility over a period, with no patient in
 * them. See {@link ../adx/adx.ts} for why ADX is the right standard for that
 * and how it relates to SDMX.
 */
@Injectable()
export class AdxService {
  constructor(
    @InjectRepository(Facility) private readonly facilities: Repository<Facility>,
    private readonly reports: ReportsService,
    private readonly weekly: WeeklyReturnService,
  ) {}

  /**
   * Build one data set's message for a period.
   *
   * MOH 505 is reported by epidemiological week, so it takes `year` and `week`;
   * everything else takes the two dates the report endpoints already use.
   */
  async export(
    facilityId: string,
    dataSetId: string,
    opts: { from?: Date; to?: Date; year?: number; week?: number },
  ): Promise<AdxExport> {
    const def = datasetById(dataSetId);
    if (!def) {
      throw new NotFoundException(
        `No ADX data set called '${dataSetId}'. The registers MOH 204A and 204B are deliberately absent: they list one row per patient, and ADX carries aggregate data only.`,
      );
    }

    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    if (!facility) throw new NotFoundException('Facility not found');
    const orgUnit = facility.kmhflCode?.trim() || facility.code;
    const orgUnitIsNational = !!facility.kmhflCode?.trim();

    const caveats: string[] = [];
    if (!orgUnitIsNational) {
      caveats.push(
        "The facility has no KMHFL code recorded, so orgUnit falls back to this system's internal facility code. No national system can resolve it.",
      );
    }

    const built =
      def.id === 'MOH505'
        ? await this.moh505(facilityId, def, opts)
        : await this.dated(facilityId, def, opts, caveats);

    const group: AdxGroup = {
      dataSet: def.id,
      orgUnit,
      period: built.period,
      completeDate: new Date().toISOString().slice(0, 10),
      values: built.values,
    };

    return {
      xml: renderAdx({ groups: [group] }),
      meta: {
        dataSet: def.id,
        name: def.name,
        orgUnit,
        orgUnitIsNational,
        period: built.period,
        values: built.values.length,
        dataElementCodes: built.codes,
        caveats: [...caveats, ...built.caveats],
      },
    };
  }

  /** The DSD that describes a message, including the codes that message used. */
  async dsd(
    facilityId: string,
    dataSetId: string,
    opts: { from?: Date; to?: Date; year?: number; week?: number },
  ): Promise<string> {
    const def = datasetById(dataSetId);
    if (!def) throw new NotFoundException(`No ADX data set called '${dataSetId}'`);
    // Running the export first means the DSD enumerates exactly what a message
    // for this period contains, rather than a list that might not match it.
    const { meta } = await this.export(facilityId, dataSetId, opts);
    return renderDsd(def, meta.dataElementCodes);
  }

  /** Every data set we can emit, for a picker. */
  catalogue() {
    return {
      standard: {
        profile: 'IHE QRPH Aggregate Data Exchange (ADX), revision 2.2',
        basedOn: 'SDMX v2.1 (ISO 17639:2013)',
        namespace: 'urn:ihe:qrph:adx:2015',
        note:
          "ADX profiles the SDMX v2.1 Data Structure Definition, so a conformant ADX message is SDMX. orgUnit is the facility's KMHFL code and dataSet is the MOH form number; the data element codes are this system's own, because KHIS does not publish its data element identifiers.",
      },
      dataSets: ADX_DATASETS.map((d) => ({
        id: d.id,
        name: d.name,
        cadence: d.cadence,
        period: d.id === 'MOH505' ? 'epidemiological week' : 'from and to dates',
        dimensions: d.dimensions.map((x) => x.id),
        note: d.note,
      })),
    };
  }

  // ── MOH 705A / 705B / 717 / 706 / 328 ─────────────────────────────────────

  private async dated(
    facilityId: string,
    def: AdxDataSetDef,
    opts: { from?: Date; to?: Date },
    _caveats: string[],
  ): Promise<{ period: string; values: AdxDataValue[]; codes: AdxCode[]; caveats: string[] }> {
    const now = new Date();
    const from = opts.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = opts.to ?? now;
    if (from > to) throw new BadRequestException('The period starts after it ends');

    const period = adxPeriod(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    const codes: AdxCode[] = [];
    const caveats: string[] = [];
    const values: AdxDataValue[] = [];
    const caveatFor = new Map(def.dataElements.filter((e) => e.caveat).map((e) => [e.code, e.caveat!]));
    const push = (v: AdxDataValue) => {
      const c = caveatFor.get(v.dataElement);
      values.push(c ? { ...v, annotation: c } : v);
    };

    if (def.id === 'MOH705A' || def.id === 'MOH705B') {
      const m = await this.reports.outpatientMorbidity(facilityId, from, to);
      const side = def.id === 'MOH705A' ? m.under5 : m.over5;
      const totals = def.id === 'MOH705A' ? m.totals.under5 : m.totals.over5;
      let uncoded = 0;
      for (const row of side) {
        const code = row.icd11 || `DX-${slug(row.diagnosis)}`;
        if (!row.icd11) uncoded += 1;
        codes.push({ code, name: row.diagnosis });
        for (const v of sexValues(code, row.total, row.male, row.female)) push(v);
      }
      push({ dataElement: 'ATT-NEW', value: totals.new });
      push({ dataElement: 'ATT-REVISIT', value: totals.revisit });
      if (uncoded) {
        caveats.push(
          `${uncoded} of ${side.length} diagnoses had no ICD-11 code on the note and are coded to a DX- slug of the diagnosis text. Those codes are local to this facility and will not match another system's.`,
        );
      }
    } else if (def.id === 'MOH717') {
      const w = await this.reports.workload(facilityId, from, to);
      const bands: [string, typeof w.outpatient.under5][] = [
        ['under5', w.outpatient.under5],
        ['5andOver', w.outpatient.over5],
      ];
      for (const [ageGroup, t] of bands) {
        for (const v of sexValues('OUT-ATT-TOTAL', t.total, t.male, t.female, { ageGroup })) push(v);
        push({ dataElement: 'OUT-ATT-NEW', value: t.new, dims: { ageGroup } });
        push({ dataElement: 'OUT-ATT-REVISIT', value: t.revisit, dims: { ageGroup } });
      }
      push({ dataElement: 'OUT-REFERRALS-IN', value: w.outpatient.referralsIn });
      for (const [type, count] of Object.entries(w.services)) {
        const code = `SVC-${slug(type)}`;
        codes.push({ code, name: `Billed services: ${type}` });
        push({ dataElement: code, value: count });
      }
      push({ dataElement: 'LAB-TESTS', value: w.laboratory.tests });
      push({ dataElement: 'LAB-TESTS-COMPLETED', value: w.laboratory.completed });
      push({ dataElement: 'IP-ADMISSIONS', value: w.inpatient.admissions });
      push({ dataElement: 'IP-DISCHARGES', value: w.inpatient.discharges });
      push({ dataElement: 'IP-DEATHS', value: w.inpatient.deaths });
      push({ dataElement: 'IP-BEDS', value: w.inpatient.beds });
      push({ dataElement: 'IP-OCCUPIED', value: w.inpatient.occupied });
      caveats.push(
        'Bed capacity and occupancy are the position at export, not an average over the period: the record keeps current bed state rather than a daily census.',
      );
    } else if (def.id === 'MOH706') {
      const lab = await this.reports.labSummary(facilityId, from, to);
      for (const row of lab.rows) {
        const dims = { department: slug(row.department), test: slug(row.testName) };
        push({ dataElement: 'LAB-TESTS', value: row.total, dims });
        push({ dataElement: 'LAB-TESTS-COMPLETED', value: row.completed, dims });
      }
      if (lab.rows.length) {
        caveats.push(
          "Department and test codes are slugs of the facility's own catalogue names, because no national laboratory codelist has been mapped.",
        );
      }
    } else if (def.id === 'MOH328') {
      const beds = await this.reports.bedReturn(facilityId, from, to);
      for (const row of beds.wards) {
        const dims = { ward: slug(row.wardName) };
        push({ dataElement: 'IP-ADMISSIONS', value: row.admissions, dims });
        push({ dataElement: 'IP-DISCHARGES', value: row.discharges, dims });
        push({ dataElement: 'IP-DEATHS', value: row.deaths, dims });
        push({ dataElement: 'BED-CAPACITY', value: row.beds, dims });
        push({ dataElement: 'BED-OCCUPIED', value: row.occupied, dims });
        push({ dataElement: 'BED-AVAILABLE', value: row.available, dims });
      }
      caveats.push(
        'Bed capacity, occupancy and availability are the position at export, not an average over the period.',
      );
    }

    return { period, values, codes, caveats };
  }

  // ── MOH 505, by epidemiological week ──────────────────────────────────────

  private async moh505(
    facilityId: string,
    _def: AdxDataSetDef,
    opts: { year?: number; week?: number },
  ): Promise<{ period: string; values: AdxDataValue[]; codes: AdxCode[]; caveats: string[] }> {
    const ret = await this.weekly.forWeek(facilityId, opts.year, opts.week);
    const bounds = weekBounds(ret.year, ret.week);
    if (!bounds) throw new BadRequestException(`Week ${ret.week} does not exist in ${ret.year}`);

    const repeats = new Set(MOH505_ROWS.filter((r) => r.deathsOf).map((r) => r.label));
    const values: AdxDataValue[] = [];

    for (const row of ret.rows) {
      // "Deaths due to Malaria" repeats malaria's death columns on its own
      // printed line. On paper that is a convenience; in a statistical message
      // it would be the same deaths counted twice, so it is left out.
      if (repeats.has(row.label)) continue;
      const condition = row.conditionCode || moh505Code(row.label);
      const bands: [string, number, number][] = [
        ['under5', row.under5Cases, row.under5Deaths],
        ['5andOver', row.over5Cases, row.over5Deaths],
      ];
      for (const [ageGroup, cases, deaths] of bands) {
        values.push({ dataElement: 'IDSR-CASES', value: cases, dims: { condition, ageGroup } });
        values.push({ dataElement: 'IDSR-DEATHS', value: deaths, dims: { condition, ageGroup } });
      }
    }

    return {
      period: adxPeriod(bounds.start, bounds.end),
      values,
      codes: [],
      caveats: [
        'Malaria deaths appear once, against malaria. The form prints them a second time on a "Deaths due to Malaria" line; repeating them here would count the same deaths twice.',
        'A case whose age is not recorded counts with the 5-and-over group, as the form has no third column.',
        ret.stored?.status === 'submitted'
          ? 'These are the figures as submitted.'
          : 'This return has not been submitted; the figures are as computed from the record now.',
      ],
    };
  }
}
