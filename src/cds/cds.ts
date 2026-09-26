import { SOURCES } from './data/sources';
import {
  ANAEMIA_SCREENING,
  ASPIRIN_PROPHYLAXIS,
  AVOID_IN_PREGNANCY,
  CALCIUM_PROPHYLAXIS,
  DEWORMING,
  IFAS,
  PREGNANCY_ANTIHYPERTENSIVES,
  PRE_ECLAMPSIA_AGE_HIGH,
  PRE_ECLAMPSIA_AGE_LOW,
  PRE_ECLAMPSIA_RISK_FACTORS,
} from './data/pregnancy-rules';
import { anaemiaGrade, bpFlag } from '../maternity/gestation';

/**
 * Clinical decision support.
 *
 * Every rule is pure, cites a published source, and declares which parts of the
 * record it read. Nothing fires on data that is absent: a rule that has not
 * seen a value says nothing rather than saying "normal", because an unmeasured
 * blood pressure is not a reassuring one.
 */

/** The parts of the record a rule may draw on. */
export type DataSource = 'problems' | 'allergies' | 'hpt' | 'demographics' | 'labs' | 'vitals';

export type Severity = 'info' | 'advice' | 'warning' | 'danger';

export interface Advice {
  ruleId: string;
  title: string;
  detail: string;
  severity: Severity;
  category: string;
  /** What the clinician should do, where the guideline says. */
  action?: string;
  /** Which parts of the record this drew on. */
  uses: DataSource[];
  source: { publisher: string; citation: string; url?: string };
  /** The specific findings that made this fire, so it can be argued with. */
  because: string[];
}

export interface CdsProblem {
  code: string | null;
  display: string;
  status: string;
}

export interface CdsAllergy {
  display: string;
  /** The HPT active-component code, where the allergen was coded. */
  componentCode: string | null;
  severity?: string | null;
}

export interface CdsVitals {
  systolic?: number | null;
  diastolic?: number | null;
  temperature?: number | null;
  pulse?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  recordedAt?: string | null;
}

export interface CdsLab {
  /** LOINC where the analyte is coded. */
  loinc?: string | null;
  name: string;
  value: number | null;
  unit?: string | null;
  takenAt?: string | null;
}

export interface CdsPregnancy {
  active: boolean;
  gestationWeeks: number | null;
  /** Interventions already recorded, so advice is not repeated back. */
  aspirinGiven: boolean;
  calciumGiven: boolean;
  ifasGiven: boolean;
  dewormingGiven: boolean;
  /** Births after 28 weeks, for the nulliparity risk factor. */
  para: number | null;
  profileHb: number | null;
}

export interface CdsDrug {
  name: string;
  /** The HPT active component, where the item is coded to one. */
  componentCode?: string | null;
  componentName?: string | null;
}

export interface CdsContext {
  ageYears: number | null;
  sex: string | null;
  problems: CdsProblem[];
  allergies: CdsAllergy[];
  vitals: CdsVitals | null;
  labs: CdsLab[];
  pregnancy: CdsPregnancy | null;
  /** Set when advice is wanted about a drug about to be prescribed. */
  proposedDrug?: CdsDrug | null;
}

const src = (key: keyof typeof SOURCES) => {
  const s = SOURCES[key];
  return { publisher: s.publisher, citation: s.citation, url: s.url };
};

const text = (p: CdsProblem) => `${p.display} ${p.code ?? ''}`.toLowerCase();
const activeProblems = (ctx: CdsContext) =>
  ctx.problems.filter((p) => p.status !== 'resolved' && p.status !== 'entered-in-error');

// ── Rules ───────────────────────────────────────────────────────────────────

/** A drug about to be given that the patient is recorded as allergic to. */
function drugAllergy(ctx: CdsContext): Advice[] {
  const drug = ctx.proposedDrug;
  if (!drug) return [];

  const hits = ctx.allergies.filter((a) => {
    // Codes first: a match on the HPT active component is exact. Falling back
    // to the name catches an uncoded allergy, which is common and still worth
    // stopping on.
    if (a.componentCode && drug.componentCode && a.componentCode === drug.componentCode) return true;
    const allergen = a.display.trim().toLowerCase();
    if (!allergen) return false;
    return (
      drug.name.toLowerCase().includes(allergen) ||
      (drug.componentName ?? '').toLowerCase().includes(allergen)
    );
  });
  if (!hits.length) return [];

  return [
    {
      ruleId: 'drug-allergy',
      title: 'Recorded allergy to this medicine',
      detail: `${drug.name} matches a recorded allergy: ${hits.map((h) => h.display).join(', ')}.`,
      severity: 'danger',
      category: 'allergy',
      action: 'Do not give unless the allergy has been reviewed and the record corrected.',
      uses: ['allergies', 'hpt'],
      source: src('facilityRecord'),
      because: hits.map((h) => `Allergy recorded: ${h.display}${h.severity ? ` (${h.severity})` : ''}`),
    },
  ];
}

/** Drugs the obstetric protocol says to avoid in pregnancy. */
function pregnancyContraindication(ctx: CdsContext): Advice[] {
  const drug = ctx.proposedDrug;
  if (!drug || !ctx.pregnancy?.active) return [];

  const haystack = `${drug.name} ${drug.componentName ?? ''}`.toLowerCase();
  const hit = AVOID_IN_PREGNANCY.find((d) => haystack.includes(d.component));
  if (!hit) return [];

  return [
    {
      ruleId: 'avoid-in-pregnancy',
      title: `Avoid in pregnancy — ${hit.klass}`,
      detail:
        'The protocol states that atenolol, ACE inhibitors, ARBs and diuretics should be avoided during pregnancy.',
      severity: 'danger',
      category: 'contraindication',
      action: `If an antihypertensive is needed: ${PREGNANCY_ANTIHYPERTENSIVES.join('; ')}.`,
      uses: ['problems', 'hpt', 'demographics'],
      source: src('obstetricProtocols'),
      because: [`${drug.name} contains ${hit.component}`, 'The patient has an open pregnancy'],
    },
  ];
}

/**
 * Low-dose aspirin where the problem list, the age or the obstetric history
 * shows a risk factor for pre-eclampsia.
 */
function preEclampsiaProphylaxis(ctx: CdsContext): Advice[] {
  const p = ctx.pregnancy;
  if (!p?.active) return [];

  const because: string[] = [];
  const uses = new Set<DataSource>(['demographics']);

  for (const factor of PRE_ECLAMPSIA_RISK_FACTORS) {
    const match = activeProblems(ctx).find((pr) => factor.matches.some((m) => text(pr).includes(m)));
    if (match) {
      because.push(`${factor.label} — recorded as "${match.display}"`);
      uses.add('problems');
    }
  }
  if (ctx.ageYears != null && ctx.ageYears > PRE_ECLAMPSIA_AGE_HIGH) {
    because.push(`Age ${ctx.ageYears}, over ${PRE_ECLAMPSIA_AGE_HIGH}`);
  }
  if (ctx.ageYears != null && ctx.ageYears < PRE_ECLAMPSIA_AGE_LOW) {
    because.push(`Age ${ctx.ageYears}, under ${PRE_ECLAMPSIA_AGE_LOW}`);
  }
  if (p.para === 0) because.push('Nulliparous');

  if (!because.length) return [];

  const out: Advice[] = [];
  const weeks = p.gestationWeeks;

  if (!p.aspirinGiven) {
    const late = weeks != null && weeks > ASPIRIN_PROPHYLAXIS.idealByWeeks;
    const tooLate = weeks != null && weeks > ASPIRIN_PROPHYLAXIS.stopWeeks;
    if (!tooLate) {
      out.push({
        ruleId: 'pre-eclampsia-aspirin',
        title: 'Low-dose aspirin for pre-eclampsia prophylaxis',
        detail: late
          ? `${ASPIRIN_PROPHYLAXIS.dose}. ${ASPIRIN_PROPHYLAXIS.note} At ${weeks} weeks that window has passed, but the protocol still says to start at the first contact after it, until ${ASPIRIN_PROPHYLAXIS.stopWeeks} weeks.`
          : `${ASPIRIN_PROPHYLAXIS.dose}, from ${ASPIRIN_PROPHYLAXIS.startWeeks}–14 weeks until ${ASPIRIN_PROPHYLAXIS.stopWeeks} weeks. ${ASPIRIN_PROPHYLAXIS.note}`,
        severity: 'advice',
        category: 'prophylaxis',
        action: 'Prescribe aspirin 150 mg once daily, and refer to a level 4 hospital or above.',
        uses: [...uses],
        source: src('obstetricProtocols'),
        because,
      });
    }
  }

  if (!p.calciumGiven && (weeks == null || weeks >= CALCIUM_PROPHYLAXIS.fromWeeks)) {
    out.push({
      ruleId: 'pre-eclampsia-calcium',
      title: 'Calcium for pre-eclampsia prophylaxis',
      detail: `${CALCIUM_PROPHYLAXIS.dose}, from ${CALCIUM_PROPHYLAXIS.fromWeeks} weeks or the earliest contact after.`,
      severity: 'advice',
      category: 'prophylaxis',
      action: 'Prescribe calcium 1 g once daily.',
      uses: [...uses],
      source: src('obstetricProtocols'),
      because,
    });
  }

  return out;
}

/** Blood pressure in pregnancy, against the protocol's thresholds. */
function pregnancyBloodPressure(ctx: CdsContext): Advice[] {
  if (!ctx.pregnancy?.active || !ctx.vitals) return [];
  const flag = bpFlag(ctx.vitals.systolic, ctx.vitals.diastolic);
  if (!flag || flag === 'normal') return [];

  const reading = `${ctx.vitals.systolic ?? '—'}/${ctx.vitals.diastolic ?? '—'}`;
  const severe = flag === 'severe';
  return [
    {
      ruleId: 'pregnancy-bp',
      title: severe ? 'Severely raised blood pressure in pregnancy' : 'Raised blood pressure in pregnancy',
      detail: severe
        ? `${reading}. At or above 160/110 with signs of severity, refer to a hospital with an obstetrician.`
        : `${reading}. At or above 140/90 in pregnancy. The protocol starts treatment at 150/90, aiming for a diastolic of 80–100 and a systolic of 130–150.`,
      severity: severe ? 'danger' : 'warning',
      category: 'monitoring',
      action: severe
        ? 'Refer to a hospital with an obstetrician. Assess for signs of severity.'
        : `Two-weekly follow-up with serial readings. If 150/90 or above, start treatment: ${PREGNANCY_ANTIHYPERTENSIVES.join('; ')}.`,
      uses: ['vitals', 'demographics'],
      source: src('obstetricProtocols'),
      because: [`Blood pressure ${reading}`],
    },
  ];
}

/** Anaemia, graded on the protocol's thresholds, from the lab record. */
function anaemia(ctx: CdsContext): Advice[] {
  const hb =
    ctx.labs.find((l) => l.loinc === '718-7' || /h(a)?emoglobin|^hb$/i.test(l.name))?.value ??
    ctx.pregnancy?.profileHb ??
    null;
  if (hb == null) {
    // Silence is not a clean bill of health, but pregnancy has a stated rule
    // about how often to look, so say that instead of nothing.
    if (ctx.pregnancy?.active) {
      return [
        {
          ruleId: 'anaemia-screening',
          title: 'No haemoglobin on record',
          detail: ANAEMIA_SCREENING,
          severity: 'info',
          category: 'screening',
          action: 'Order a haemoglobin.',
          uses: ['labs', 'demographics'],
          source: src('obstetricProtocols'),
          because: ['No haemoglobin result found for this patient'],
        },
      ];
    }
    return [];
  }

  const grade = anaemiaGrade(hb);
  if (!grade || grade === 'none') return [];

  const pregnant = !!ctx.pregnancy?.active;
  return [
    {
      ruleId: 'anaemia',
      title: `${grade[0].toUpperCase()}${grade.slice(1)} anaemia`,
      detail: `Haemoglobin ${hb} g/dL. Anaemia is below 11 g/dL — mild 10–11, moderate 7–10, severe below 7.`,
      severity: grade === 'severe' ? 'danger' : 'warning',
      category: 'treatment',
      action:
        grade === 'severe'
          ? 'Assess urgently; transfusion is considered below 7 g/dL. Treat the cause.'
          : pregnant
            ? `Iron and folic acid: ${IFAS.dose}.`
            : 'Investigate the cause and treat.',
      uses: ['labs', ...(pregnant ? (['demographics'] as DataSource[]) : [])],
      source: src('obstetricProtocols'),
      because: [`Haemoglobin ${hb} g/dL`],
    },
  ];
}

/** Routine supplements in pregnancy that have not been recorded as given. */
function pregnancySupplements(ctx: CdsContext): Advice[] {
  const p = ctx.pregnancy;
  if (!p?.active) return [];
  const out: Advice[] = [];

  if (!p.ifasGiven) {
    out.push({
      ruleId: 'ifas',
      title: 'Iron and folic acid not recorded',
      detail: `Daily through pregnancy: ${IFAS.dose}.`,
      severity: 'advice',
      category: 'prophylaxis',
      action: 'Give iron and folic acid, and record it at this contact.',
      uses: ['demographics'],
      source: src('obstetricProtocols'),
      because: ['No antenatal contact records iron and folic acid'],
    });
  }

  if (!p.dewormingGiven && p.gestationWeeks != null && p.gestationWeeks >= DEWORMING.fromWeeks) {
    out.push({
      ruleId: 'deworming',
      title: 'Deworming not recorded',
      detail: `Once in the second trimester: ${DEWORMING.dose}.`,
      severity: 'advice',
      category: 'prophylaxis',
      action: 'Give a single dose and record it.',
      uses: ['demographics'],
      source: src('obstetricProtocols'),
      because: [`${p.gestationWeeks} weeks, and no deworming recorded`],
    });
  }

  return out;
}

/** Fever, which is a finding whoever the patient is. */
function fever(ctx: CdsContext): Advice[] {
  const t = ctx.vitals?.temperature;
  if (t == null || t < 38) return [];
  return [
    {
      ruleId: 'fever',
      title: 'Fever',
      detail: `Temperature ${t} °C.`,
      severity: t >= 39 ? 'warning' : 'info',
      category: 'monitoring',
      action: ctx.pregnancy?.active
        ? 'In pregnancy or the puerperium, fever with abdominal pain or offensive discharge suggests sepsis.'
        : 'Look for a source.',
      uses: ['vitals'],
      source: src('facilityRecord'),
      because: [`Temperature ${t} °C`],
    },
  ];
}

/** Every rule, in the order advice should be read. */
const RULES: ((ctx: CdsContext) => Advice[])[] = [
  drugAllergy,
  pregnancyContraindication,
  pregnancyBloodPressure,
  anaemia,
  preEclampsiaProphylaxis,
  pregnancySupplements,
  fever,
];

const ORDER: Record<Severity, number> = { danger: 0, warning: 1, advice: 2, info: 3 };

/**
 * Run every rule against the record.
 *
 * Rules never throw into the caller: a rule that fails is a rule that gives no
 * advice, and one broken rule must not silence the rest.
 */
export function evaluate(ctx: CdsContext): Advice[] {
  const out: Advice[] = [];
  for (const rule of RULES) {
    try {
      out.push(...rule(ctx));
    } catch {
      // A rule that cannot run says nothing, and the others still do.
    }
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** Which parts of the record the rule set is capable of drawing on. */
export const DATA_SOURCES_USED: DataSource[] = [
  'problems',
  'allergies',
  'hpt',
  'demographics',
  'labs',
  'vitals',
];
