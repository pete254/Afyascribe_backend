/**
 * Section codes for the clinical summary.
 *
 * The Kenya Core IG defines no Composition profile, but its Patient profile is
 * built on the International Patient Summary (IPS), so the summary follows the
 * IPS document shape: a Composition whose sections each carry human-readable
 * narrative alongside the resources they summarise. Every code below was
 * checked against Regenstrief/LOINC on the national terminology service.
 */
export const SUMMARY_LOINC = {
  /** Composition.type — "Patient summary Document". */
  document: { code: '60591-5', display: 'Patient summary Document' },
  problems: { code: '11450-4', display: 'Problem list - Reported' },
  allergies: { code: '48765-2', display: 'Allergies and adverse reactions Document' },
  medications: { code: '10160-0', display: 'History of Medication use Narrative' },
  results: { code: '30954-2', display: 'Relevant diagnostic tests/laboratory data note' },
  encounters: { code: '46240-8', display: 'History of Hospitalizations+Outpatient visits Narrative' },
  procedures: { code: '47519-4', display: 'History of Procedures Document' },
  carePlan: { code: '18776-5', display: 'Plan of care note' },
  familyHistory: { code: '10157-6', display: 'History of family member diseases note' },
  immunisations: { code: '11369-6', display: 'History of Immunization note' },
  pregnancy: { code: '10162-6', display: 'History of pregnancies Narrative' },
} as const;

/**
 * Observation codes for the obstetric record. Each one was checked against
 * Regenstrief/LOINC on the national terminology service.
 *
 * Fetal heart rate is deliberately absent: the only LOINC that fits is
 * "Fetal Heart rate US", which asserts an ultrasound method, and a rate counted
 * with a Pinard stethoscope is not that. The figure stays in the record.
 */
export const OBSTETRIC_LOINC = {
  pregnancyStatus: { code: '11449-6', display: 'Pregnancy status - Reported' },
  lmp: { code: '8665-2', display: 'Last menstrual period start date' },
  edd: { code: '11778-8', display: 'Delivery date Estimated' },
  gestationalAge: { code: '11884-4', display: 'Gestational age Estimated' },
  gravida: { code: '11996-6', display: '[#] Pregnancies' },
  para: { code: '11977-6', display: '[#] Parity' },
  fundalHeight: { code: '11881-0', display: 'Uterus Fundal height Tape measure' },
  systolic: { code: '8480-6', display: 'Systolic blood pressure' },
  diastolic: { code: '8462-4', display: 'Diastolic blood pressure' },
  haemoglobin: { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' },
  bodyWeight: { code: '29463-7', display: 'Body weight' },
  breastfeeding: { code: '63895-7', display: 'Breastfeeding status' },
  birthWeight: { code: '8339-4', display: 'Birth weight Measured' },
  apgar1: { code: '9272-6', display: '1 minute Apgar Score' },
  apgar5: { code: '9274-2', display: '5 minute Apgar Score' },
  apgar10: { code: '9271-8', display: '10 minute Apgar Score' },
  liveBirths: { code: '11636-8', display: '[#] Births.live' },
  stillbirths: { code: '57062-2', display: '[#] Births.stillborn' },
} as const;

/** Escape text before it goes into the narrative XHTML. */
export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A section's narrative. FHIR requires the text to be a self-contained XHTML
 * fragment: it is what a human reads when the receiving system cannot process
 * the structured entries, so it must stand on its own.
 */
export function narrative(rows: string[][], headers: string[], emptyText: string): string {
  if (!rows.length) {
    return `<div xmlns="http://www.w3.org/1999/xhtml"><p>${esc(emptyText)}</p></div>`;
  }
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<div xmlns="http://www.w3.org/1999/xhtml"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
