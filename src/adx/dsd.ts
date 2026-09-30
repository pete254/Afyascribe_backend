import { AdxCode, AdxDataSetDef } from './moh-datasets';

/**
 * The SDMX v2.1 Data Structure Definition behind an ADX data set.
 *
 * A data message on its own is just numbers with codes; the DSD is what says
 * what the codes mean, which dimensions each data element takes, and how the
 * period is expressed. ADX requires one, and it is the difference between
 * "we emit some XML" and "we emit SDMX".
 *
 * The constraints the profile puts on a conformant DSD, and which this honours:
 *
 *  - exactly one str:DataStructure per DSD (§8.2.1.4)
 *  - dimensions `dataElement`, `orgUnit` and a TimeDimension whose @id is
 *    `TIME_PERIOD`, all referring to the mandatory IHE_QRPH concept scheme
 *    `ADX_MANDATORY_CONCEPTS` (§8.2.1.4.1)
 *  - the TimeDimension carries a str:TextFormat with textType `TimeRange`,
 *    which is what makes `period` an ISO 8601 interval (§8.2.1.4.2)
 *  - exactly one str:Group with @id `OUTER_DIMENSIONS`, holding orgUnit and
 *    TIME_PERIOD, because ADX attaches those at group level (§8.2.1.4.3)
 *  - a str:PrimaryMeasure linked to the mandatory `value` concept (§8.2.1.4.4)
 *  - per-data-element disaggregation expressed as a com:Annotation with
 *    @id `Disaggregation` on each code (§8.2.2)
 */

export const SDMX_MESSAGE_NS = 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message';
export const SDMX_STRUCTURE_NS = 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure';
export const SDMX_COMMON_NS = 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common';

/** Our own agency id. Codes under it are ours, not the Ministry's. */
export const AGENCY = 'AFYASCRIBE';
export const VERSION = '1.0';
const MANDATORY_AGENCY = 'IHE_QRPH';
const MANDATORY_SCHEME = 'ADX_MANDATORY_CONCEPTS';
const OWN_SCHEME = 'ADX_AFYASCRIBE_CONCEPTS';

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Add `spaces` to every line, keeping the block's own relative indentation. */
const shift = (block: string, spaces: number): string =>
  block
    .split('\n')
    .map((l) => (l.trim() ? ' '.repeat(spaces) + l : l))
    .join('\n');

const name = (text: string, indent = ''): string =>
  `${indent}<com:Name xml:lang="en">${esc(text)}</com:Name>`;

/** A code, with a Disaggregation annotation for each dimension it requires. */
function codeXml(c: AdxCode, dims: string[]): string {
  if (!dims.length) {
    return `<str:Code id="${esc(c.code)}">\n${name(c.name, '  ')}\n</str:Code>`;
  }
  const annotations = dims
    .map(
      (d) =>
        `    <com:Annotation id="Disaggregation">\n` +
        `      <com:AnnotationText>${esc(d)}</com:AnnotationText>\n` +
        `    </com:Annotation>`,
    )
    .join('\n');
  return (
    `<str:Code id="${esc(c.code)}">\n` +
    `  <com:Annotations>\n${annotations}\n  </com:Annotations>\n` +
    `${name(c.name, '  ')}\n` +
    `</str:Code>`
  );
}

function codelistXml(
  id: string,
  label: string,
  codes: AdxCode[],
  dimsFor: (code: string) => string[],
): string {
  const body = codes.map((c) => shift(codeXml(c, dimsFor(c.code)), 2)).join('\n');
  return (
    `<str:Codelist id="${esc(id)}" agencyID="${AGENCY}" version="${VERSION}">\n` +
    `${name(label, '  ')}\n` +
    `${body ? body + '\n' : ''}` +
    `</str:Codelist>`
  );
}

/** A dimension that refers to one of our own concepts and its codelist. */
function dimensionXml(id: string, codelistId: string | null, position: number): string {
  const rep = codelistId
    ? `  <str:LocalRepresentation>\n` +
      `    <str:Enumeration>\n` +
      `      <Ref agencyID="${AGENCY}" id="${esc(codelistId)}" version="${VERSION}"/>\n` +
      `    </str:Enumeration>\n` +
      `  </str:LocalRepresentation>\n`
    : '';
  const mandatory = id === 'dataElement' || id === 'orgUnit';
  const scheme = mandatory ? MANDATORY_SCHEME : OWN_SCHEME;
  const agency = mandatory ? MANDATORY_AGENCY : AGENCY;
  return (
    `<str:Dimension id="${esc(id)}" position="${position}">\n` +
    `  <str:ConceptIdentity>\n` +
    `    <Ref id="${esc(id)}" maintainableParentID="${scheme}"` +
    ` maintainableParentVersion="${VERSION}" agencyID="${agency}"/>\n` +
    `  </str:ConceptIdentity>\n` +
    rep +
    `</str:Dimension>`
  );
}

/**
 * Render one data set's DSD as an SDMX v2.1 structure message.
 *
 * A dimension whose codelist is open (a ward name, a test name) gets a concept
 * and a group reference but no enumeration, because there is nothing honest to
 * enumerate. The same is true of a data set whose data elements are one per
 * diagnosis: `dataElementCodes` is what was actually seen, so passing the codes
 * from a real export produces a DSD that describes that export exactly.
 */
export function renderDsd(
  def: AdxDataSetDef,
  dataElementCodes: AdxCode[] = [],
  prepared: Date = new Date(),
): string {
  const dimsByCode = new Map(def.dataElements.map((e) => [e.code, e.dims ?? []]));
  const codes: AdxCode[] = [
    ...def.dataElements.map((e) => ({ code: e.code, name: e.name })),
    // Codes seen in a real export that the fixed list does not cover.
    ...dataElementCodes.filter((c) => !dimsByCode.has(c.code)),
  ];

  const codelists = [
    codelistXml(`CL_DataElements_${def.id}`, `${def.name} — data elements`, codes, (code) =>
      dimsByCode.get(code) ?? (def.openDataElements ? openElementDims(def) : []),
    ),
    ...def.dimensions
      .filter((d) => !d.open)
      .map((d) =>
        codelistXml(`CL_${capitalise(d.id)}`, d.name, d.codes, () => []),
      ),
  ]
    .map((c) => shift(c, 6))
    .join('\n');

  // Our own concepts: one per disaggregation dimension we define.
  const ownConcepts = def.dimensions
    .map(
      (d) =>
        `        <str:Concept id="${esc(d.id)}">\n${name(d.name, '          ')}\n        </str:Concept>`,
    )
    .join('\n');

  const dims = [
    dimensionXml('dataElement', `CL_DataElements_${def.id}`, 1),
    dimensionXml('orgUnit', null, 2),
    ...def.dimensions.map((d, i) =>
      dimensionXml(d.id, d.open ? null : `CL_${capitalise(d.id)}`, 3 + i),
    ),
  ]
    .map((d) => shift(d, 12))
    .join('\n');

  const groupDims = ['orgUnit', 'TIME_PERIOD']
    .map(
      (id) =>
        `            <str:GroupDimension>\n` +
        `              <str:DimensionReference>\n` +
        `                <Ref id="${id}"/>\n` +
        `              </str:DimensionReference>\n` +
        `            </str:GroupDimension>`,
    )
    .join('\n');

  const stamp = prepared.toISOString().replace(/\.\d{3}Z$/, 'Z');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mes:Structure xmlns:mes="${SDMX_MESSAGE_NS}"
               xmlns:str="${SDMX_STRUCTURE_NS}"
               xmlns:com="${SDMX_COMMON_NS}">
  <mes:Header>
    <mes:ID>ADX_DSD_${esc(def.id)}</mes:ID>
    <mes:Test>false</mes:Test>
    <mes:Prepared>${stamp}</mes:Prepared>
    <mes:Sender id="${AGENCY}"/>
  </mes:Header>
  <mes:Structures>
    <str:Codelists>
${codelists}
    </str:Codelists>
    <str:Concepts>
      <str:ConceptScheme id="${OWN_SCHEME}" agencyID="${AGENCY}" version="${VERSION}">
${name(`Disaggregation concepts used by ${def.name}`, '        ')}
${ownConcepts}
      </str:ConceptScheme>
    </str:Concepts>
    <str:DataStructures>
      <str:DataStructure id="${esc(def.id)}" agencyID="${AGENCY}" version="${VERSION}">
${name(def.name, '        ')}
        <str:DataStructureComponents>
          <str:DimensionList id="DimensionDescriptor">
${dims}
            <str:TimeDimension id="TIME_PERIOD" position="${3 + def.dimensions.length}">
              <str:ConceptIdentity>
                <Ref id="period" maintainableParentID="${MANDATORY_SCHEME}" maintainableParentVersion="${VERSION}" agencyID="${MANDATORY_AGENCY}"/>
              </str:ConceptIdentity>
              <str:LocalRepresentation>
                <str:TextFormat textType="TimeRange"/>
              </str:LocalRepresentation>
            </str:TimeDimension>
          </str:DimensionList>
          <str:Group id="OUTER_DIMENSIONS">
${groupDims}
          </str:Group>
          <str:MeasureList id="MeasureDescriptor">
            <str:PrimaryMeasure id="OBS_VALUE">
              <str:ConceptIdentity>
                <Ref id="value" maintainableParentID="${MANDATORY_SCHEME}" maintainableParentVersion="${VERSION}" agencyID="${MANDATORY_AGENCY}"/>
              </str:ConceptIdentity>
            </str:PrimaryMeasure>
          </str:MeasureList>
        </str:DataStructureComponents>
      </str:DataStructure>
    </str:DataStructures>
  </mes:Structures>
</mes:Structure>
`;
}

/** Which dimensions an open-codelist data element carries, by data set. */
function openElementDims(def: AdxDataSetDef): string[] {
  // MOH 705's per-diagnosis elements are sex-disaggregated; a service-type or
  // test element added at export time is not.
  return def.id.startsWith('MOH705') ? ['sex'] : [];
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
