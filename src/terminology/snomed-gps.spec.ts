import { domainForFsn, parseGpsLine, semanticTag, toConceptRow } from './snomed-gps';

describe('semanticTag', () => {
  it('reads the tag at the end of a Fully Specified Name', () => {
    expect(semanticTag('Myocardial infarction (disorder)')).toBe('disorder');
  });

  it('takes the last parenthesis, not an earlier one in the term itself', () => {
    expect(semanticTag('Entire thyroid gland (left) (body structure)')).toBe('body structure');
  });

  it('is null where there is no tag', () => {
    expect(semanticTag('Something untagged')).toBeNull();
  });
});

describe('domainForFsn', () => {
  it.each([
    ['Myocardial infarction (disorder)', 'diagnosis'],
    ['Headache (finding)', 'diagnosis'],
    ['Appendectomy (procedure)', 'procedure'],
    ['Chemotherapy (regime/therapy)', 'procedure'],
    ['Systolic blood pressure (observable entity)', 'lab'],
    ['Plasmodium falciparum (organism)', 'lab'],
    ['Penicillin (substance)', 'allergen'],
    ['Amoxicillin 500 mg capsule (clinical drug)', 'drug'],
  ])('%s → %s', (fsn, domain) => {
    expect(domainForFsn(fsn)).toBe(domain);
  });

  it('files an unrecognised tag as reference rather than guessing a clinical domain', () => {
    // A mis-filed concept offered in a diagnosis picker is worse than one
    // that is merely harder to find.
    expect(domainForFsn('Left (qualifier value)')).toBe('reference');
    expect(domainForFsn('No tag here')).toBe('reference');
  });
});

describe('parseGpsLine', () => {
  const line = '22298006\t1\tMyocardial infarction (disorder)\tMyocardial infarction';

  it('reads the four tab-separated fields', () => {
    expect(parseGpsLine(line)).toEqual({
      conceptId: '22298006',
      active: true,
      fsn: 'Myocardial infarction (disorder)',
      preferredTerm: 'Myocardial infarction',
    });
  });

  it('splits on tabs only, so a term containing commas survives', () => {
    const row = parseGpsLine('11111001\t1\tFever, chills and rigors (finding)\tFever, chills and rigors');
    expect(row?.preferredTerm).toBe('Fever, chills and rigors');
  });

  it('marks an inactive concept rather than dropping it', () => {
    expect(parseGpsLine('12345006\t0\tOld concept (disorder)\tOld concept')?.active).toBe(false);
  });

  it('skips a blank line', () => {
    expect(parseGpsLine('')).toBeNull();
    expect(parseGpsLine('   ')).toBeNull();
  });

  it('skips a header row without needing to know it is one', () => {
    expect(parseGpsLine('conceptId\tactive\tFSN\tPT')).toBeNull();
  });

  it('skips a short row rather than throwing, so one bad line cannot abandon the import', () => {
    expect(parseGpsLine('22298006\t1')).toBeNull();
  });

  it('falls back to the FSN when the preferred term is empty', () => {
    expect(parseGpsLine('22298006\t1\tMyocardial infarction (disorder)\t')?.preferredTerm).toBe(
      'Myocardial infarction (disorder)',
    );
  });
});

describe('toConceptRow', () => {
  const row = parseGpsLine('22298006\t1\tMyocardial infarction (disorder)\tMyocardial infarction')!;

  it('shows the preferred term and keeps the FSN searchable', () => {
    const c = toConceptRow(row);
    expect(c.display).toBe('Myocardial infarction');
    expect(c.synonyms).toEqual(['Myocardial infarction (disorder)']);
    expect(c.extras).toMatchObject({ fsn: 'Myocardial infarction (disorder)', source: 'GPS' });
  });

  it('records the semantic tag, which disambiguates identical preferred terms', () => {
    expect(toConceptRow(row).concept_class).toBe('disorder');
  });

  it('does not repeat the FSN as a synonym when it equals the preferred term', () => {
    const same = parseGpsLine('138875005\t1\tUntagged term\tUntagged term')!;
    expect(toConceptRow(same).synonyms).toEqual([]);
  });

  it('maps an inactive concept to retired, so old records still resolve', () => {
    const old = parseGpsLine('12345006\t0\tOld concept (disorder)\tOld concept')!;
    expect(toConceptRow(old).retired).toBe(true);
  });

  it('files it under the SNOMED org and system', () => {
    const c = toConceptRow(row);
    expect(c.org).toBe('SNOMED-INTL');
    expect(c.system).toBe('SNOMED-CT');
    expect(c.code).toBe('22298006');
  });
});
