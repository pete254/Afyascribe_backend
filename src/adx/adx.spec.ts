import { adxPeriod, renderAdx } from './adx';

describe('adxPeriod', () => {
  it('a calendar month is a one-month duration', () => {
    expect(adxPeriod('2026-01-01', '2026-01-31')).toBe('2026-01-01/P1M');
  });

  it('February in a leap year is still one month', () => {
    expect(adxPeriod('2024-02-01', '2024-02-29')).toBe('2024-02-01/P1M');
  });

  it('a quarter is three months, not ninety-odd days', () => {
    expect(adxPeriod('2026-04-01', '2026-06-30')).toBe('2026-04-01/P3M');
  });

  it('a calendar year is P1Y', () => {
    expect(adxPeriod('2026-01-01', '2026-12-31')).toBe('2026-01-01/P1Y');
  });

  it('twelve months that do not start in January stay in months', () => {
    // A financial year is not a calendar year, and P1Y would misdescribe it.
    expect(adxPeriod('2026-07-01', '2027-06-30')).toBe('2026-07-01/P12M');
  });

  it('a part-month falls back to a day count', () => {
    expect(adxPeriod('2026-01-01', '2026-01-15')).toBe('2026-01-01/P15D');
  });

  it('a period that does not start on the first is a day count', () => {
    expect(adxPeriod('2026-01-15', '2026-02-14')).toBe('2026-01-15/P31D');
  });

  it('a single day is one day, not zero', () => {
    expect(adxPeriod('2026-03-09', '2026-03-09')).toBe('2026-03-09/P1D');
  });
});

describe('renderAdx', () => {
  const exported = new Date('2026-09-30T10:00:00.000Z');

  it('declares the ADX namespace and the required exported attribute', () => {
    const xml = renderAdx({ exported, groups: [] });
    expect(xml).toContain('xmlns="urn:ihe:qrph:adx:2015"');
    expect(xml).toContain('exported="2026-09-30T10:00:00Z"');
  });

  it('writes a group with its three required attributes', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          values: [{ dataElement: 'MAL', value: 42 }],
        },
      ],
    });
    expect(xml).toContain('<group dataSet="MOH705A" orgUnit="12345" period="2026-08-01/P1M">');
    expect(xml).toContain('<dataValue dataElement="MAL" value="42"/>');
  });

  it('carries disaggregation as attributes on the data value', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          values: [{ dataElement: 'MAL', value: 7, dims: { sex: 'F', ageGroup: 'under5' } }],
        },
      ],
    });
    expect(xml).toContain('<dataValue dataElement="MAL" value="7" sex="F" ageGroup="under5"/>');
  });

  it('leaves out a dimension with no value rather than writing an empty one', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          values: [{ dataElement: 'MAL', value: 7, dims: { sex: undefined, ageGroup: 'under5' } }],
        },
      ],
    });
    expect(xml).not.toContain('sex=');
    expect(xml).toContain('ageGroup="under5"');
  });

  it('keeps a zero, which is a real reported figure and not an absence', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          values: [{ dataElement: 'MAL', value: 0 }],
        },
      ],
    });
    expect(xml).toContain('value="0"');
  });

  it('escapes a facility name or comment that contains XML metacharacters', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          comment: 'Kirinyaga "A" & B <clinic>',
          values: [{ dataElement: 'MAL', value: 1, annotation: 'Counted <manually> & checked' }],
        },
      ],
    });
    expect(xml).toContain('comment="Kirinyaga &quot;A&quot; &amp; B &lt;clinic&gt;"');
    expect(xml).toContain('<annotation>Counted &lt;manually&gt; &amp; checked</annotation>');
    // Nothing unescaped should have slipped through.
    expect(xml).not.toContain('<clinic>');
  });

  it('gives an annotated value a closing tag rather than self-closing it', () => {
    const xml = renderAdx({
      exported,
      groups: [
        {
          dataSet: 'MOH705A',
          orgUnit: '12345',
          period: '2026-08-01/P1M',
          values: [{ dataElement: 'MAL', value: 1, annotation: 'estimated' }],
        },
      ],
    });
    expect(xml).toContain('</dataValue>');
    expect(xml).not.toContain('estimated</annotation>\n    />');
  });
});
