/**
 * ADX — aggregate data exchange, the SDMX side of interoperability.
 *
 * Everything else here speaks FHIR, which carries one patient at a time. The
 * MOH returns are a different kind of data: counts for a facility over a
 * period, with no patient in them at all. FHIR is a poor fit and the standard
 * for this is SDMX.
 *
 * IHE's Aggregate Data Exchange profile (QRPH ADX, rev 2.2) is a profile of
 * the SDMX v2.1 Data Structure Definition — SDMX v2.1 being ISO 17639:2013(E).
 * The profile's own words: "ADX profiles this ISO standard; it constrains the
 * SDMX specification and articulates how an ADX-conformant DSD is developed."
 * So emitting conformant ADX is emitting SDMX, and it is also the format
 * DHIS2 ingests natively — which matters because KHIS is DHIS2.
 *
 * The normative message shape (Appendix 8I of the supplement):
 *
 *   <adx xmlns="urn:ihe:qrph:adx:2015" exported="2015-02-08T19:30:00Z">
 *     <group orgUnit="342" period="2015-01-01/P1M" dataSet="MALARIA">
 *       <dataValue dataElement="MAL01" value="32"/>
 *       <dataValue dataElement="MAL04" value="10" ageGroup="under5" sex="M"/>
 *     </group>
 *   </adx>
 *
 * `exported` is required on the root; `dataSet`, `orgUnit` and `period` are
 * required on every group; `dataElement` and `value` are required on every
 * data value. Anything else is a dimension declared by the DSD, and the
 * schema permits arbitrary extra attributes, which is how ADX carries a
 * "ragged-right" form where some rows are disaggregated and others are not.
 *
 * https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_ADX.pdf
 */

export const ADX_NAMESPACE = 'urn:ihe:qrph:adx:2015';

/** A single reported figure, plus whichever dimensions its data element takes. */
export interface AdxDataValue {
  dataElement: string;
  value: number;
  /** Dimension attributes — e.g. `{ sex: 'M', ageGroup: 'under5' }`. */
  dims?: Record<string, string | undefined>;
  /** Free text qualifying this one figure. Becomes an <annotation> child. */
  annotation?: string;
}

/** One facility, one period, one data set. */
export interface AdxGroup {
  /** The MOH form or data set this belongs to, e.g. 'MOH705A'. */
  dataSet: string;
  /** The facility, by its Master Facility List code where we have one. */
  orgUnit: string;
  /** An ISO 8601 interval — see {@link adxPeriod}. */
  period: string;
  /** When the facility considered the return complete (an ISO date). */
  completeDate?: string;
  comment?: string;
  values: AdxDataValue[];
}

export interface AdxMessage {
  /** When this message was produced. Defaults to now. */
  exported?: Date;
  groups: AdxGroup[];
}

/**
 * SDMX expresses a reporting period as an ISO 8601 interval — a start instant
 * and a duration — not as two dates. A calendar month is `2026-01-01/P1M`.
 *
 * Given the two dates our report endpoints take, work out the duration that
 * describes them. Whole months, quarters and years get their proper duration;
 * anything else falls back to a day count, which is still a valid interval and
 * is honest about not being a standard reporting period.
 */
export function adxPeriod(from: string | Date, to: string | Date): string {
  const start = new Date(from);
  const end = new Date(to);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const startsOnFirst = start.getUTCDate() === 1;
  // `to` is inclusive in our reports, so the period runs to the end of that day.
  const dayAfterEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
  const endsOnFirst = dayAfterEnd.getUTCDate() === 1;

  if (startsOnFirst && endsOnFirst) {
    const months =
      (dayAfterEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (dayAfterEnd.getUTCMonth() - start.getUTCMonth());
    if (months === 12 && start.getUTCMonth() === 0) return `${day(start)}/P1Y`;
    if (months > 0) return `${day(start)}/P${months}M`;
  }

  const days = Math.max(1, Math.round((dayAfterEnd.getTime() - start.getTime()) / 86_400_000));
  return `${day(start)}/P${days}D`;
}

const escapeAttr = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const attrs = (pairs: Record<string, string | undefined>): string =>
  Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${escapeAttr(String(v))}"`)
    .join('');

/** Serialise a message as ADX/XML. Written by hand: the format is small, and
 * doing the escaping here rather than trusting a library keeps it visible. */
export function renderAdx(message: AdxMessage): string {
  const exported = (message.exported ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const body = message.groups
    .map((g) => {
      const values = g.values
        .map((v) => {
          const a = attrs({
            dataElement: v.dataElement,
            value: String(v.value),
            ...(v.dims ?? {}),
          });
          return v.annotation
            ? `    <dataValue${a}>\n      <annotation>${escapeText(v.annotation)}</annotation>\n    </dataValue>`
            : `    <dataValue${a}/>`;
        })
        .join('\n');

      const ga = attrs({
        dataSet: g.dataSet,
        orgUnit: g.orgUnit,
        period: g.period,
        completeDate: g.completeDate,
        comment: g.comment,
      });
      return `  <group${ga}>\n${values}\n  </group>`;
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<adx xmlns="${ADX_NAMESPACE}" exported="${exported}">\n` +
    `${body}\n` +
    `</adx>\n`
  );
}
