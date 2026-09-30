import { AdxService } from './adx.service';
import { renderDsd } from './dsd';
import { MOH705A, MOH505 } from './moh-datasets';

/** Just enough of each collaborator to exercise the mapping. */
function build(overrides: {
  facility?: Record<string, unknown> | null;
  morbidity?: unknown;
  workload?: unknown;
  lab?: unknown;
  beds?: unknown;
  weekly?: unknown;
}) {
  const facilities = {
    findOne: jest.fn().mockResolvedValue(
      overrides.facility === undefined
        ? { id: 'f1', code: 'AFYA01', kmhflCode: '12345', name: 'Test Clinic' }
        : overrides.facility,
    ),
  };
  const reports = {
    outpatientMorbidity: jest.fn().mockResolvedValue(overrides.morbidity),
    workload: jest.fn().mockResolvedValue(overrides.workload),
    labSummary: jest.fn().mockResolvedValue(overrides.lab),
    bedReturn: jest.fn().mockResolvedValue(overrides.beds),
  };
  const weekly = { forWeek: jest.fn().mockResolvedValue(overrides.weekly) };
  return {
    service: new AdxService(facilities as any, reports as any, weekly as any),
    facilities,
    reports,
    weekly,
  };
}

const AUG = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-31T00:00:00Z') };

const morbidity = {
  period: { from: AUG.from, to: AUG.to },
  under5: [
    { diagnosis: 'Malaria', icd11: '1F40', total: 10, male: 4, female: 6, new: 8, revisit: 2 },
    // Three people whose gender is recorded as neither male nor female.
    { diagnosis: 'Acute watery diarrhoea', icd11: null, total: 5, male: 1, female: 1, new: 5, revisit: 0 },
  ],
  over5: [],
  totals: {
    under5: { diagnoses: 2, total: 15, male: 5, female: 7, new: 13, revisit: 2 },
    over5: { diagnoses: 0, total: 0, male: 0, female: 0, new: 0, revisit: 0 },
  },
};

describe('AdxService — MOH 705A', () => {
  it('codes a diagnosis to ICD-11 where the note had a code', async () => {
    const { service } = build({ morbidity });
    const { xml } = await service.export('f1', 'MOH705A', AUG);
    expect(xml).toContain('dataElement="1F40"');
  });

  it('falls back to a local DX- slug where there was no code, and says so', async () => {
    const { service } = build({ morbidity });
    const { xml, meta } = await service.export('f1', 'MOH705A', AUG);
    expect(xml).toContain('dataElement="DX-ACUTE-WATERY-DIARRHOEA"');
    expect(meta.caveats.join(' ')).toMatch(/1 of 2 diagnoses had no ICD-11 code/);
  });

  it('reports the sex residual so the disaggregation sums to the total', async () => {
    const { service } = build({ morbidity });
    const { xml } = await service.export('f1', 'MOH705A', AUG);
    // 5 total, 1 male, 1 female — the other three must not vanish.
    expect(xml).toContain('dataElement="DX-ACUTE-WATERY-DIARRHOEA" value="3" sex="U"');
  });

  it('omits the residual entirely when every patient was male or female', async () => {
    const { service } = build({ morbidity });
    const { xml } = await service.export('f1', 'MOH705A', AUG);
    const malariaRows = xml.split('\n').filter((l) => l.includes('"1F40"'));
    expect(malariaRows).toHaveLength(2);
    expect(malariaRows.join(' ')).not.toContain('sex="U"');
  });

  it('uses the KMHFL code as orgUnit and marks it national', async () => {
    const { service } = build({ morbidity });
    const { xml, meta } = await service.export('f1', 'MOH705A', AUG);
    expect(xml).toContain('orgUnit="12345"');
    expect(meta.orgUnitIsNational).toBe(true);
    expect(meta.caveats.join(' ')).not.toMatch(/KMHFL/);
  });

  it('warns when there is no KMHFL code, rather than passing an internal code off as national', async () => {
    const { service } = build({
      morbidity,
      facility: { id: 'f1', code: 'AFYA01', kmhflCode: null, name: 'Test Clinic' },
    });
    const { xml, meta } = await service.export('f1', 'MOH705A', AUG);
    expect(xml).toContain('orgUnit="AFYA01"');
    expect(meta.orgUnitIsNational).toBe(false);
    expect(meta.caveats.join(' ')).toMatch(/no KMHFL code/);
  });

  it('expresses a calendar month as an SDMX interval', async () => {
    const { service } = build({ morbidity });
    const { meta } = await service.export('f1', 'MOH705A', AUG);
    expect(meta.period).toBe('2026-08-01/P1M');
  });

  it('705B reads the over-5 side, not the under-5 side', async () => {
    const { service, reports } = build({ morbidity });
    const { xml } = await service.export('f1', 'MOH705B', AUG);
    expect(reports.outpatientMorbidity).toHaveBeenCalled();
    // The over-5 list is empty here, so only the attendance lines remain.
    expect(xml).not.toContain('"1F40"');
    expect(xml).toContain('dataElement="ATT-NEW" value="0"');
  });
});

describe('AdxService — MOH 505', () => {
  const weekly = {
    year: 2026,
    week: 36,
    rows: [
      { label: 'Suspected Malaria', conditionCode: 'MALARIA', computed: true, under5Cases: 12, under5Deaths: 1, over5Cases: 30, over5Deaths: 2 },
      { label: 'Deaths due to Malaria', conditionCode: null, computed: true, under5Cases: 1, under5Deaths: 1, over5Cases: 2, over5Deaths: 2 },
      { label: 'Cholera', conditionCode: 'CHOLERA', computed: true, under5Cases: 0, under5Deaths: 0, over5Cases: 0, over5Deaths: 0 },
    ],
    stored: null,
  };

  it('does not repeat malaria deaths on their own line', async () => {
    const { service } = build({ weekly });
    const { xml, meta } = await service.export('f1', 'MOH505', { year: 2026, week: 36 });
    // The repeat line would have arrived as a MOH505- slug code.
    expect(xml).not.toContain('MOH505-DEATHS-DUE-TO-MALARIA');
    expect(meta.caveats.join(' ')).toMatch(/would count the same deaths twice/);
  });

  it('carries cases and deaths by condition and age group', async () => {
    const { service } = build({ weekly });
    const { xml } = await service.export('f1', 'MOH505', { year: 2026, week: 36 });
    expect(xml).toContain('dataElement="IDSR-CASES" value="12" condition="MALARIA" ageGroup="under5"');
    expect(xml).toContain('dataElement="IDSR-DEATHS" value="2" condition="MALARIA" ageGroup="5andOver"');
  });

  it('keeps a zero, because a week with no cholera is a reported fact', async () => {
    const { service } = build({ weekly });
    const { xml } = await service.export('f1', 'MOH505', { year: 2026, week: 36 });
    expect(xml).toContain('value="0" condition="CHOLERA"');
  });

  it('expresses an epidemiological week as a seven-day interval', async () => {
    const { service } = build({ weekly });
    const { meta } = await service.export('f1', 'MOH505', { year: 2026, week: 36 });
    expect(meta.period).toMatch(/^\d{4}-\d{2}-\d{2}\/P7D$/);
  });

  it('says whether the figures were submitted or are as computed now', async () => {
    const { service } = build({ weekly });
    const { meta } = await service.export('f1', 'MOH505', { year: 2026, week: 36 });
    expect(meta.caveats.join(' ')).toMatch(/has not been submitted/);
  });
});

describe('AdxService — MOH 328', () => {
  const beds = {
    period: { from: AUG.from, to: AUG.to },
    wards: [
      { wardId: 'w1', wardName: 'Maternity Ward', wardType: 'maternity', beds: 10, occupied: 6, available: 4, admissions: 20, discharges: 18, deaths: 1 },
    ],
    totals: { beds: 10, occupied: 6, available: 4, admissions: 20, discharges: 18, deaths: 1, occupancyRate: 60 },
  };

  it('annotates a point-in-time bed count rather than passing it off as a period figure', async () => {
    const { service } = build({ beds });
    const { xml, meta } = await service.export('f1', 'MOH328', AUG);
    expect(xml).toContain('<annotation>A count of beds as at export, not an average over the period.</annotation>');
    expect(meta.caveats.join(' ')).toMatch(/not an average over the period/);
  });

  it('keys ward figures by a stable slug of the ward name', async () => {
    const { service } = build({ beds });
    const { xml } = await service.export('f1', 'MOH328', AUG);
    expect(xml).toContain('ward="MATERNITY-WARD"');
  });
});

describe('AdxService — refusals', () => {
  it('refuses the 204 registers, and says why they are not aggregate data', async () => {
    const { service } = build({});
    await expect(service.export('f1', 'MOH204A', AUG)).rejects.toThrow(/one row per patient/);
  });

  it('refuses a data set it does not have', async () => {
    const { service } = build({});
    await expect(service.export('f1', 'MOH999', AUG)).rejects.toThrow(/No ADX data set/);
  });

  it('refuses a period that runs backwards', async () => {
    const { service } = build({ morbidity });
    await expect(
      service.export('f1', 'MOH705A', { from: AUG.to, to: AUG.from }),
    ).rejects.toThrow(/starts after it ends/);
  });
});

describe('renderDsd', () => {
  it('declares the three SDMX namespaces', () => {
    const xml = renderDsd(MOH705A);
    expect(xml).toContain('xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message"');
    expect(xml).toContain('xmlns:str="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure"');
    expect(xml).toContain('xmlns:com="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"');
  });

  it("names the time dimension TIME_PERIOD, as the profile requires", () => {
    const xml = renderDsd(MOH705A);
    expect(xml).toContain('<str:TimeDimension id="TIME_PERIOD"');
  });

  it('declares the period as a TimeRange, which is what makes it an interval', () => {
    const xml = renderDsd(MOH705A);
    expect(xml).toContain('<str:TextFormat textType="TimeRange"/>');
  });

  it('refers the mandatory dimensions to the IHE concept scheme, not ours', () => {
    const xml = renderDsd(MOH705A);
    expect(xml).toContain('maintainableParentID="ADX_MANDATORY_CONCEPTS"');
    expect(xml).toContain('agencyID="IHE_QRPH"');
  });

  it('has exactly one OUTER_DIMENSIONS group, holding orgUnit and the period', () => {
    const xml = renderDsd(MOH705A);
    expect(xml.match(/<str:Group id="OUTER_DIMENSIONS">/g)).toHaveLength(1);
    const group = xml.split('<str:Group id="OUTER_DIMENSIONS">')[1].split('</str:Group>')[0];
    expect(group).toContain('<Ref id="orgUnit"/>');
    expect(group).toContain('<Ref id="TIME_PERIOD"/>');
  });

  it('links a primary measure to the mandatory value concept', () => {
    const xml = renderDsd(MOH705A);
    expect(xml).toContain('<str:PrimaryMeasure id="OBS_VALUE">');
    expect(xml).toContain('<Ref id="value" maintainableParentID="ADX_MANDATORY_CONCEPTS"');
  });

  it('annotates which dimensions a data element requires', () => {
    const xml = renderDsd(MOH505);
    const cases = xml.split('<str:Code id="IDSR-CASES">')[1].split('</str:Code>')[0];
    expect(cases).toContain('<com:Annotation id="Disaggregation">');
    expect(cases).toContain('<com:AnnotationText>condition</com:AnnotationText>');
    expect(cases).toContain('<com:AnnotationText>ageGroup</com:AnnotationText>');
  });

  it('enumerates the IDSR conditions, which are a genuinely closed list', () => {
    const xml = renderDsd(MOH505);
    expect(xml).toContain('<str:Codelist id="CL_Condition"');
    expect(xml).toContain('<str:Code id="CHOLERA">');
    expect(xml).toContain('<str:Code id="AFP">');
  });

  it('gives an open dimension no enumeration, since there is nothing to enumerate', () => {
    const xml = renderDsd(require('./moh-datasets').MOH328);
    expect(xml).not.toContain('CL_Ward');
    expect(xml).toContain('<str:Dimension id="ward"');
  });

  it('includes the codes an export actually used', () => {
    const xml = renderDsd(MOH705A, [{ code: 'DX-SOMETHING', name: 'Something' }]);
    expect(xml).toContain('<str:Code id="DX-SOMETHING">');
    expect(xml).toContain('<com:Name xml:lang="en">Something</com:Name>');
  });

  it('escapes a diagnosis name containing an ampersand', () => {
    const xml = renderDsd(MOH705A, [{ code: 'DX-X', name: 'Ear & throat' }]);
    expect(xml).toContain('Ear &amp; throat');
  });
});
