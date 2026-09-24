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
