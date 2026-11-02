import { countLab, labCorrections, overlayLab } from './lab-counts';

describe('MOH 505 laboratory lines from the laboratory module (I-7)', () => {
  it('counts tests released in the week, and positives where the record can say', () => {
    const lab = countLab([
      {
        line: 'malariaMicroscopy',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: true,
      },
      {
        line: 'malariaMicroscopy',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: false,
      },
      // Collected this week, result not yet released: not tested yet.
      {
        line: 'malariaMicroscopy',
        collectedInWeek: true,
        releasedInWeek: false,
        positive: false,
      },
      {
        line: 'typhoid',
        collectedInWeek: false,
        releasedInWeek: true,
        positive: true,
      },
    ]);
    expect(lab.malariaMicroscopy).toEqual({ Tested: 2, Positive: 1 });
    expect(lab.typhoid).toEqual({ Tested: 1, Positive: 1 });
    expect(lab.malariaRdt).toEqual({ Tested: 0, Positive: 0 });
  });

  it('does not guess what needs more than a flag', () => {
    const lab = countLab([
      {
        line: 'dysentery',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: true,
      },
      {
        line: 'tuberculosis',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: true,
      },
    ]);
    // S. dysenteriae needs the organism; MDR/XDR needs the resistance result.
    expect(lab.dysentery).toEqual({ Tested: 1 });
    expect(lab.tuberculosis).toEqual({ Tested: 1 });
  });

  it('counts CSF samples collected and tested, leaving contamination to a person', () => {
    const lab = countLab([
      {
        line: 'bacterialMeningitis',
        collectedInWeek: true,
        releasedInWeek: false,
        positive: false,
      },
      {
        line: 'bacterialMeningitis',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: false,
      },
    ]);
    expect(lab.bacterialMeningitis).toEqual({ 'No CSF': 2, 'No tested': 1 });
  });

  it('keeps a hand-entered figure over the count, and only what was changed', () => {
    const computed = countLab([
      {
        line: 'malariaRdt',
        collectedInWeek: true,
        releasedInWeek: true,
        positive: true,
      },
    ]);
    const sent = {
      malariaRdt: { Tested: 1, Positive: 1 },
      bacterialMeningitis: {
        'No CSF': 0,
        'No tested': 0,
        'No contaminated': 2,
      },
    };
    const kept = labCorrections(computed, sent);
    expect(kept).toEqual({ bacterialMeningitis: { 'No contaminated': 2 } });
    expect(overlayLab(computed, kept).bacterialMeningitis).toEqual({
      'No CSF': 0,
      'No tested': 0,
      'No contaminated': 2,
    });
    expect(overlayLab(computed, kept).malariaRdt).toEqual({
      Tested: 1,
      Positive: 1,
    });
  });
});
