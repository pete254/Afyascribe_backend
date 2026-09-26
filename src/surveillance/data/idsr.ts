/**
 * Kenya's IDSR priority conditions.
 *
 * Transcribed from the Ministry of Health, Division of Disease Surveillance and
 * Response — "IDSR Standard Case Definitions for Immediately Reportable
 * (notifiable) Diseases" and "...for Weekly Reportable Diseases", published by
 * Kenya's National Public Health Institute.
 *
 * The case definitions are the Ministry's words, lightly cleaned of the column
 * breaks the published table leaves in the text. They are here because a
 * detector that tells a clinician "this might be cholera" is useless unless it
 * can also show them what cholera means for the purpose of notifying it.
 *
 * https://www.nphi.go.ke/sites/default/files/2024-02/Case%20definition%20Chart_0.pdf
 */

export const IDSR_SOURCE = {
  publisher: 'Ministry of Health, Kenya — Division of Disease Surveillance and Response',
  document: 'IDSR Standard Case Definitions (immediately reportable and weekly reportable)',
  url: 'https://www.nphi.go.ke/sites/default/files/2024-02/Case%20definition%20Chart_0.pdf',
  note: 'Kenya adopted the IDSR strategy in 2006; the technical guidelines are in their 3rd edition.',
} as const;

/**
 * How the International Health Regulations (2005) treat a condition.
 *
 * `notify` — Annex 2 requires notification to WHO in every case.
 * `assess` — Annex 2 requires the decision instrument to be applied.
 *
 * Only the conditions Annex 2 actually names are marked. Kenya's immediate list
 * is broader than Annex 2, and pretending otherwise would overstate what the
 * Regulations require.
 */
export type IhrStatus = 'notify' | 'assess';

export interface IdsrCondition {
  /** Stable local code used on notifications and returns. */
  code: string;
  name: string;
  /** Reported within 24 hours of suspicion. */
  immediate: boolean;
  /** Counted on the weekly return (MOH 505). */
  weekly: boolean;
  ihr?: IhrStatus;
  /** The Ministry's suspected-case definition, which is what triggers notifying. */
  suspectedCase: string;
  /** Words that, in a diagnosis or problem, suggest this condition. */
  terms: string[];
  /** Where the count comes from, when not from a clinician's diagnosis. */
  derivedFrom?: 'maternity' | 'newborn';
  note?: string;
}

export const IDSR_CONDITIONS: readonly IdsrCondition[] = [
  {
    code: 'AFP',
    name: 'Acute flaccid paralysis (poliomyelitis)',
    immediate: true,
    weekly: true,
    ihr: 'notify',
    suspectedCase:
      'Any case with weakness or floppiness of the limbs of sudden onset not due to trauma in a child less than 15 years of age, or any person of any age in whom a clinician suspects polio.',
    terms: ['acute flaccid paralysis', 'flaccid paralysis', 'poliomyelitis', 'polio', 'afp'],
  },
  {
    code: 'AEFI',
    name: 'Adverse event following immunisation',
    immediate: true,
    weekly: true,
    suspectedCase:
      'A medical incident taking place after vaccination which causes concern and is believed to be caused by the vaccination.',
    terms: ['adverse event following immunisation', 'adverse event following immunization', 'aefi'],
  },
  {
    code: 'ANTHRAX',
    name: 'Anthrax',
    immediate: true,
    weekly: true,
    suspectedCase:
      'Any person with an acute onset illness in cutaneous, gastro-intestinal or pulmonary form, AND an epidemiological link to confirmed or suspected animal cases or contaminated animal products.',
    terms: ['anthrax'],
  },
  {
    code: 'CHOLERA',
    name: 'Cholera',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'A patient aged 5 years or more presenting with acute, profuse, effortless watery diarrhoea (3 or more times within 24 hours). In an epidemic, any person aged 2 years and above with acute watery diarrhoea, with or without vomiting.',
    terms: ['cholera', 'acute watery diarrhoea', 'acute watery diarrhea'],
  },
  {
    code: 'DENGUE',
    name: 'Dengue fever',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'Any person with acute febrile illness of 2–7 days duration with 2 or more of: headache, retro-orbital pain, myalgia, arthralgia, rash, haemorrhagic manifestations, leucopenia.',
    terms: ['dengue'],
  },
  {
    code: 'GUINEA_WORM',
    name: 'Guinea worm disease (dracunculiasis)',
    immediate: true,
    weekly: true,
    suspectedCase:
      'A person presenting with a skin lesion (blister or boil) living in a high-risk area for guinea worm disease, or with a history of travel to an endemic area.',
    terms: ['guinea worm', 'dracunculiasis'],
  },
  {
    code: 'FLU_NEW_SUBTYPE',
    name: 'Influenza due to a new subtype',
    immediate: true,
    weekly: false,
    ihr: 'notify',
    suspectedCase:
      'Human influenza caused by a new subtype, such as pandemic influenza A H1N1 or avian influenza H5N1.',
    terms: ['novel influenza', 'new subtype influenza', 'avian influenza', 'h5n1', 'h1n1', 'pandemic influenza'],
    note: 'Reported by national reference laboratories.',
  },
  {
    code: 'MEASLES',
    name: 'Measles',
    immediate: true,
    weekly: true,
    suspectedCase:
      'Any person with fever and maculopapular (non-vesicular) generalised rash and any one of cough, coryza or conjunctivitis; or any person in whom a clinician suspects measles.',
    terms: ['measles', 'rubeola'],
  },
  {
    code: 'NNT',
    name: 'Neonatal tetanus',
    immediate: true,
    weekly: true,
    suspectedCase:
      'Any newborn with a normal ability to suck and cry during the first two days of life who, between the 3rd and 28th day, cannot suck normally and becomes stiff or has convulsions or both.',
    terms: ['neonatal tetanus'],
  },
  {
    code: 'PLAGUE',
    name: 'Plague',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'Any person with sudden onset of fever, chills, headache, severe malaise, prostration and painful swelling of lymph nodes; or cough with blood-stained sputum, chest pain and difficulty breathing.',
    terms: ['plague', 'bubonic', 'pneumonic plague'],
    note: 'Annex 2 of the IHR names pneumonic plague specifically.',
  },
  {
    code: 'RVF',
    name: 'Rift Valley fever',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'A person with acute febrile illness (axillary temperature above 37.5 °C) of more than 48 hours that does not respond to antibiotic or antimalarial therapy, with an epidemiological link to sick or dead animals or to an area where RVF is suspected.',
    terms: ['rift valley fever', 'rvf'],
  },
  {
    code: 'SARI',
    name: 'Severe acute respiratory infection',
    immediate: true,
    weekly: true,
    suspectedCase:
      'A severely ill person aged 5 or over with acute (within 7 days) lower respiratory infection: sudden onset of fever above 38 °C, cough or sore throat, and shortness of breath or difficulty breathing; or any person who died of an unexplained respiratory illness.',
    terms: ['severe acute respiratory infection', 'sari'],
  },
  {
    code: 'MDR_TB',
    name: 'Tuberculosis (MDR/XDR)',
    immediate: true,
    weekly: true,
    suspectedCase:
      'Any patient with tuberculosis whose results show multi-drug or extensively drug-resistant disease.',
    terms: [
      'mdr tb',
      'mdr-tb',
      'xdr tb',
      'xdr-tb',
      'drug resistant tuberculosis',
      'multidrug resistant tuberculosis',
    ],
    note:
      'Reported by laboratories with testing competence. MOH 505 carries this as "Suspected MDR/XDR TB" — the weekly form has no row for drug-sensitive tuberculosis.',
  },
  {
    code: 'VHF',
    name: 'Viral haemorrhagic fever',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'Acute onset of fever of less than 3 weeks in a severely ill patient AND any 2 of: haemorrhagic or purpuric rash, epistaxis, haematemesis, haemoptysis, blood in stool, or other haemorrhagic sign, with no known predisposing host factors.',
    terms: ['viral haemorrhagic fever', 'viral hemorrhagic fever', 'vhf', 'ebola', 'marburg', 'lassa', 'crimean-congo'],
  },
  {
    code: 'YELLOW_FEVER',
    name: 'Yellow fever',
    immediate: true,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'Any person with acute onset of fever followed by jaundice within two weeks of the first symptoms. Haemorrhagic manifestations and renal failure may occur.',
    terms: ['yellow fever'],
  },

  // ── Weekly only ─────────────────────────────────────────────────────────
  {
    code: 'ACUTE_JAUNDICE',
    name: 'Acute jaundice',
    immediate: false,
    weekly: true,
    suspectedCase:
      'Any person presenting with acute onset (within 14 days) of yellowness of the eyes or skin, with or without fever.',
    terms: ['acute jaundice', 'jaundice'],
  },
  {
    code: 'ACUTE_MALNUTRITION',
    name: 'Acute malnutrition',
    immediate: false,
    weekly: true,
    suspectedCase:
      'Children under five years with bilateral pitting oedema, or visible severe wasting, or a mid-upper arm circumference below the threshold for their age.',
    terms: ['acute malnutrition', 'severe acute malnutrition', 'sam', 'marasmus', 'kwashiorkor'],
  },
  {
    code: 'BLOODY_DIARRHOEA',
    name: 'Diarrhoea with blood',
    immediate: false,
    weekly: true,
    suspectedCase: 'A person with diarrhoea with visible blood in the stool.',
    terms: ['bloody diarrhoea', 'bloody diarrhea', 'dysentery', 'shigella'],
  },
  {
    code: 'MALARIA',
    name: 'Malaria',
    immediate: false,
    weekly: true,
    suspectedCase:
      'Uncomplicated: any person with fever or history of fever within 24 hours without signs of severe disease. Severe: with signs of vital organ involvement.',
    terms: ['malaria'],
  },
  {
    code: 'MATERNAL_DEATH',
    name: 'Maternal death',
    immediate: false,
    weekly: true,
    derivedFrom: 'maternity',
    suspectedCase:
      'The death of a woman while pregnant or within 42 days of the delivery or termination of pregnancy, irrespective of duration or site, from any cause related to or aggravated by the pregnancy or its management, but not from accidental or incidental causes.',
    terms: ['maternal death'],
  },
  {
    code: 'MENINGOCOCCAL',
    name: 'Meningococcal meningitis',
    immediate: false,
    weekly: true,
    ihr: 'assess',
    suspectedCase:
      'Any person with sudden onset of fever (above 38.5 °C rectal or 38.0 °C axillary) and one of: neck stiffness, altered consciousness, or other meningeal signs.',
    terms: ['meningococcal', 'meningitis'],
  },
  {
    code: 'NEONATAL_DEATH',
    name: 'Neonatal death',
    immediate: false,
    weekly: true,
    derivedFrom: 'newborn',
    suspectedCase: 'The death of a live-born infant within the first 28 days of life.',
    terms: ['neonatal death'],
  },
  {
    code: 'RABIES',
    name: 'Rabies',
    immediate: false,
    weekly: true,
    suspectedCase:
      'A person with an animal bite or scratch, or contact with the saliva of a suspected rabid animal, with or without headache, neck pain, nausea, fever, fear of water, anxiety or agitation.',
    terms: ['rabies', 'dog bite', 'animal bite'],
  },
  {
    code: 'TYPHOID',
    name: 'Typhoid fever',
    immediate: false,
    weekly: true,
    suspectedCase:
      'Any person with gradual onset of steadily increasing and then persistently high fever, with any of chills, malaise, headache, sore throat, cough, abdominal pain, and constipation or diarrhoea.',
    terms: ['typhoid', 'enteric fever'],
  },
];

export const CONDITION_BY_CODE = new Map(IDSR_CONDITIONS.map((c) => [c.code, c]));

export const immediateConditions = () => IDSR_CONDITIONS.filter((c) => c.immediate);
export const weeklyConditions = () => IDSR_CONDITIONS.filter((c) => c.weekly);
export const ihrConditions = () => IDSR_CONDITIONS.filter((c) => c.ihr);

/**
 * The International Health Regulations (2005), Annex 2.
 *
 * Four diseases are notifiable to WHO in every case; a further group must be
 * assessed with the decision instrument. Kenya's list is wider than Annex 2 —
 * this is only about what the Regulations themselves require.
 */
export const IHR_SOURCE = {
  publisher: 'World Health Organization — International Health Regulations (2005), Annex 2',
  alwaysNotify: [
    'Smallpox',
    'Poliomyelitis due to wild-type poliovirus',
    'Human influenza caused by a new subtype',
    'Severe acute respiratory syndrome (SARS)',
  ],
  note: 'Smallpox and SARS are not on Kenya’s IDSR list and so do not appear here as conditions.',
} as const;
