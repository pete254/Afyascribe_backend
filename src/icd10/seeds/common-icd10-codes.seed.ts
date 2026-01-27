export const COMMON_ICD10_CODES = [
  // Infectious Diseases
  { code: 'A09', short_description: 'Infectious gastroenteritis and colitis', search_terms: ['diarrhea', 'gastro', 'stomach flu'] },
  { code: 'B34.9', short_description: 'Viral infection, unspecified', search_terms: ['virus', 'viral'] },
  
  // Diabetes
  { code: 'E11.9', short_description: 'Type 2 diabetes mellitus without complications', search_terms: ['diabetes', 't2dm', 'sugar'] },
  { code: 'E11.65', short_description: 'Type 2 diabetes with hyperglycemia', search_terms: ['high sugar', 'hyperglycemia'] },
  { code: 'E10.9', short_description: 'Type 1 diabetes mellitus without complications', search_terms: ['t1dm', 'juvenile diabetes'] },
  
  // Hypertension
  { code: 'I10', short_description: 'Essential (primary) hypertension', search_terms: ['hypertension', 'high blood pressure', 'htn', 'bp'] },
  { code: 'I11.0', short_description: 'Hypertensive heart disease with heart failure', search_terms: ['hypertensive heart'] },
  
  // Respiratory
  { code: 'J00', short_description: 'Acute nasopharyngitis (common cold)', search_terms: ['cold', 'common cold', 'runny nose'] },
  { code: 'J06.9', short_description: 'Acute upper respiratory infection', search_terms: ['uri', 'upper respiratory', 'throat infection'] },
  { code: 'J18.9', short_description: 'Pneumonia, unspecified organism', search_terms: ['pneumonia', 'lung infection'] },
  { code: 'J45.909', short_description: 'Unspecified asthma, uncomplicated', search_terms: ['asthma'] },
  { code: 'J20.9', short_description: 'Acute bronchitis', search_terms: ['bronchitis', 'chest infection'] },
  
  // Malaria (Important for Kenya!)
  { code: 'B50.9', short_description: 'Plasmodium falciparum malaria', search_terms: ['malaria', 'falciparum'] },
  { code: 'B51.9', short_description: 'Plasmodium vivax malaria', search_terms: ['vivax malaria'] },
  { code: 'B54', short_description: 'Unspecified malaria', search_terms: ['malaria'] },
  
  // HIV/AIDS
  { code: 'B20', short_description: 'HIV disease', search_terms: ['hiv', 'aids'] },
  { code: 'Z21', short_description: 'Asymptomatic HIV infection status', search_terms: ['hiv positive'] },
  
  // Tuberculosis
  { code: 'A15.9', short_description: 'Respiratory tuberculosis', search_terms: ['tb', 'tuberculosis'] },
  { code: 'A16.9', short_description: 'Tuberculosis of lung', search_terms: ['pulmonary tb'] },
  
  // Gastro
  { code: 'K21.9', short_description: 'Gastro-esophageal reflux disease', search_terms: ['gerd', 'reflux', 'heartburn'] },
  { code: 'K29.70', short_description: 'Gastritis', search_terms: ['gastritis', 'stomach pain'] },
  { code: 'K59.00', short_description: 'Constipation', search_terms: ['constipation'] },
  
  // Musculoskeletal
  { code: 'M54.5', short_description: 'Low back pain', search_terms: ['back pain', 'lumbago'] },
  { code: 'M25.50', short_description: 'Pain in joint', search_terms: ['joint pain', 'arthralgia'] },
  { code: 'M79.3', short_description: 'Myalgia', search_terms: ['muscle pain', 'body aches'] },
  
  // Mental Health
  { code: 'F32.9', short_description: 'Major depressive disorder', search_terms: ['depression', 'depressed'] },
  { code: 'F41.9', short_description: 'Anxiety disorder', search_terms: ['anxiety', 'anxious'] },
  { code: 'F51.9', short_description: 'Sleep disorder', search_terms: ['insomnia', 'sleep problem'] },
  
  // Pregnancy
  { code: 'Z34.90', short_description: 'Normal pregnancy', search_terms: ['antenatal', 'pregnancy'] },
  { code: 'O80', short_description: 'Normal delivery', search_terms: ['delivery', 'birth'] },
  
  // Injuries
  { code: 'S09.90', short_description: 'Unspecified injury of head', search_terms: ['head injury'] },
  { code: 'S61.9', short_description: 'Open wound of wrist, hand and fingers', search_terms: ['hand cut', 'finger cut'] },
  { code: 'T14.90', short_description: 'Injury, unspecified', search_terms: ['injury'] },
  
  // Headache
  { code: 'R51', short_description: 'Headache', search_terms: ['headache', 'head pain'] },
  { code: 'G43.909', short_description: 'Migraine', search_terms: ['migraine'] },
  
  // Fever
  { code: 'R50.9', short_description: 'Fever, unspecified', search_terms: ['fever', 'pyrexia'] },
  
  // Other common
  { code: 'R10.9', short_description: 'Abdominal pain', search_terms: ['stomach pain', 'abdominal pain'] },
  { code: 'R05', short_description: 'Cough', search_terms: ['cough'] },
  { code: 'N39.0', short_description: 'Urinary tract infection', search_terms: ['uti', 'urine infection'] },
  { code: 'H10.9', short_description: 'Conjunctivitis', search_terms: ['red eye', 'pink eye', 'conjunctivitis'] },
  
  // Add 100-500 more based on your hospital's common diagnoses
];
