import { Json, collectionBundle, stampEncounter, validateShrBundle } from './shr';

const episode = (id = 'ep-1'): Json => ({ resourceType: 'EpisodeOfCare', id, status: 'finished' });
const encounter = (id = 'enc-1', episodeId: string | null = 'ep-1'): Json => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  ...(episodeId ? { episodeOfCare: [{ reference: `EpisodeOfCare/${episodeId}` }] } : {}),
});
const observation = (id: string, over: Json = {}): Json => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  ...over,
});

describe('stamping the encounter onto clinical resources', () => {
  it('points every clinical resource at the encounter', () => {
    const out = stampEncounter([observation('o1'), observation('o2')], 'enc-1');
    expect(out.every((r) => r.encounter.reference === 'Encounter/enc-1')).toBe(true);
  });

  it('leaves context resources alone', () => {
    const out = stampEncounter(
      [{ resourceType: 'Patient', id: 'p1' }, { resourceType: 'Organization', id: 'o1' }],
      'enc-1',
    );
    expect(out.every((r) => r.encounter === undefined)).toBe(true);
  });

  it('does not steal a resource that already names its own encounter', () => {
    // An antenatal contact belongs to the contact it happened at, not to
    // whichever visit is being submitted.
    const [out] = stampEncounter([observation('o1', { encounter: { reference: 'Encounter/anc-9' } })], 'enc-1');
    expect(out.encounter.reference).toBe('Encounter/anc-9');
  });

  it('does not mutate what it was given', () => {
    const input = [observation('o1')];
    stampEncounter(input, 'enc-1');
    expect(input[0].encounter).toBeUndefined();
  });
});

describe("the SHR's rules, checked before sending", () => {
  const good = () =>
    collectionBundle([
      episode(),
      encounter(),
      ...stampEncounter([observation('o1'), observation('o2')], 'enc-1'),
    ]);

  it('passes a bundle that follows all three rules', () => {
    expect(validateShrBundle(good())).toEqual({ ok: true, problems: [] });
  });

  it('rejects a transaction bundle', () => {
    // The mistake this whole change exists to fix.
    const b = { ...good(), type: 'transaction' };
    const v = validateShrBundle(b);
    expect(v.ok).toBe(false);
    expect(v.problems[0].rule).toBe('bundle-type');
    expect(v.problems[0].detail).toContain('collection');
  });

  it('rejects an encounter with no episode of care', () => {
    const b = collectionBundle([episode(), encounter('enc-1', null), ...stampEncounter([observation('o1')], 'enc-1')]);
    const v = validateShrBundle(b);
    expect(v.problems.some((p) => p.rule === 'encounter-episode')).toBe(true);
  });

  it('rejects an episode reference that is not in the bundle', () => {
    const b = collectionBundle([encounter('enc-1', 'ep-missing'), ...stampEncounter([observation('o1')], 'enc-1')]);
    const v = validateShrBundle(b);
    expect(v.problems.some((p) => p.rule === 'dangling-reference' && p.at === 'Encounter/enc-1')).toBe(true);
  });

  it('rejects a clinical resource that references no encounter', () => {
    const b = collectionBundle([episode(), encounter(), observation('o1')]);
    const v = validateShrBundle(b);
    expect(v.problems).toEqual([
      { at: 'Observation/o1', rule: 'unreferenced', detail: 'Every clinical resource must reference the Encounter' },
    ]);
  });

  it('rejects a clinical resource pointing at an encounter that is absent', () => {
    const b = collectionBundle([episode(), encounter(), observation('o1', { encounter: { reference: 'Encounter/nope' } })]);
    const v = validateShrBundle(b);
    expect(v.problems.some((p) => p.rule === 'dangling-reference' && p.at === 'Observation/o1')).toBe(true);
  });

  it('rejects a bundle with no encounter at all', () => {
    const b = collectionBundle([episode(), observation('o1')]);
    const v = validateShrBundle(b);
    expect(v.problems.some((p) => p.rule === 'missing-encounter')).toBe(true);
  });

  it('reports every problem, not just the first', () => {
    const b = collectionBundle([encounter('enc-1', null), observation('o1'), observation('o2')]);
    const v = validateShrBundle({ ...b, type: 'transaction' });
    expect(v.problems.map((p) => p.rule).sort()).toEqual([
      'bundle-type',
      'encounter-episode',
      'unreferenced',
      'unreferenced',
    ]);
  });

  it('accepts several encounters, each with its own episode', () => {
    const b = collectionBundle([
      episode('ep-1'),
      episode('ep-2'),
      encounter('enc-1', 'ep-1'),
      encounter('enc-2', 'ep-2'),
      ...stampEncounter([observation('o1')], 'enc-1'),
      observation('o2', { encounter: { reference: 'Encounter/enc-2' } }),
    ]);
    expect(validateShrBundle(b).ok).toBe(true);
  });

  it('says so plainly when handed something that is not a bundle', () => {
    const v = validateShrBundle({ resourceType: 'Patient', id: 'p1' });
    expect(v.ok).toBe(false);
    expect(v.problems[0].rule).toBe('bundle-type');
  });
});
