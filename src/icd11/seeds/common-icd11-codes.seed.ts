// Curated ICD-11 MMS stem codes for offline use.
// Compiled for common East-African primary-care presentations.
// Verify each code against the official WHO ICD-11 MMS
// (https://icd.who.int/browse11) before clinical rollout.
export const COMMON_ICD11_CODES = [
  // Infectious or parasitic diseases (Chapter 01)
  { code: '1A00', short_description: 'Cholera', search_terms: ['cholera', 'vibrio'] },
  { code: '1A07', short_description: 'Typhoid fever', search_terms: ['typhoid', 'enteric fever', 'salmonella typhi'] },
  { code: '1A40', short_description: 'Gastroenteritis or colitis of infectious origin', search_terms: ['gastroenteritis', 'diarrhoea', 'diarrhea', 'stomach infection', 'colitis'] },
  { code: '1B10', short_description: 'Respiratory tuberculosis', search_terms: ['tb', 'tuberculosis', 'pulmonary tb', 'lung tb'] },
  { code: '1B1Z', short_description: 'Tuberculosis, unspecified', search_terms: ['tb', 'tuberculosis'] },
  { code: '1C62', short_description: 'Human immunodeficiency virus disease', search_terms: ['hiv', 'aids', 'immunodeficiency'] },
  { code: '1F40', short_description: 'Plasmodium falciparum malaria', search_terms: ['malaria', 'falciparum'] },
  { code: '1F41', short_description: 'Plasmodium vivax malaria', search_terms: ['malaria', 'vivax'] },
  { code: '1F42', short_description: 'Plasmodium malariae malaria', search_terms: ['malaria', 'malariae'] },
  { code: '1F4Z', short_description: 'Malaria, unspecified', search_terms: ['malaria'] },

  // Blood or blood-forming organs (Chapter 03)
  { code: '3A00', short_description: 'Iron deficiency anaemia', search_terms: ['anaemia', 'anemia', 'iron deficiency'] },
  { code: '3A9Z', short_description: 'Anaemia, unspecified', search_terms: ['anaemia', 'anemia'] },

  // Endocrine, nutritional or metabolic (Chapter 05)
  { code: '5A10', short_description: 'Type 1 diabetes mellitus', search_terms: ['diabetes', 'type 1', 't1dm', 'insulin dependent'] },
  { code: '5A11', short_description: 'Type 2 diabetes mellitus', search_terms: ['diabetes', 'type 2', 't2dm', 'sugar'] },

  // Mental, behavioural or neurodevelopmental (Chapter 06)
  { code: '6A70', short_description: 'Single episode depressive disorder', search_terms: ['depression', 'depressive', 'low mood'] },
  { code: '6A71', short_description: 'Recurrent depressive disorder', search_terms: ['depression', 'recurrent depression'] },
  { code: '6B00', short_description: 'Generalised anxiety disorder', search_terms: ['anxiety', 'gad', 'worry'] },

  // Nervous system (Chapter 08)
  { code: '8A80', short_description: 'Migraine', search_terms: ['migraine', 'headache'] },

  // Visual system (Chapter 09)
  { code: '9A60', short_description: 'Conjunctivitis', search_terms: ['conjunctivitis', 'red eye', 'pink eye'] },

  // Circulatory system (Chapter 11)
  { code: 'BA00', short_description: 'Essential hypertension', search_terms: ['hypertension', 'high blood pressure', 'hbp', 'bp'] },
  { code: 'BA01', short_description: 'Hypertensive heart disease', search_terms: ['hypertensive heart disease', 'hypertension'] },

  // Respiratory system (Chapter 12)
  { code: 'CA00', short_description: 'Acute nasopharyngitis', search_terms: ['common cold', 'cold', 'coryza', 'runny nose'] },
  { code: 'CA07', short_description: 'Acute upper respiratory infection', search_terms: ['uri', 'upper respiratory infection', 'flu', 'cough'] },
  { code: 'CA20', short_description: 'Acute bronchitis', search_terms: ['bronchitis', 'chest infection'] },
  { code: 'CA22', short_description: 'Chronic obstructive pulmonary disease', search_terms: ['copd', 'chronic bronchitis', 'emphysema'] },
  { code: 'CA23', short_description: 'Asthma', search_terms: ['asthma', 'wheezing', 'bronchial'] },
  { code: 'CA40', short_description: 'Pneumonia', search_terms: ['pneumonia', 'lung infection', 'chest infection'] },

  // Digestive system (Chapter 13)
  { code: 'DA42', short_description: 'Gastritis', search_terms: ['gastritis', 'stomach inflammation'] },
  { code: 'DA63', short_description: 'Peptic ulcer, site unspecified', search_terms: ['peptic ulcer', 'ulcer', 'stomach ulcer'] },

  // Musculoskeletal system (Chapter 15)
  { code: 'FA0Z', short_description: 'Osteoarthritis, unspecified', search_terms: ['osteoarthritis', 'arthritis', 'joint pain'] },

  // Genitourinary system (Chapter 16)
  { code: 'GC08', short_description: 'Urinary tract infection, site not specified', search_terms: ['uti', 'urinary tract infection', 'bladder infection'] },

  // Symptoms, signs or clinical findings (Chapter 21)
  { code: 'MG26', short_description: 'Fever', search_terms: ['fever', 'pyrexia', 'high temperature'] },
  { code: 'ME84.2', short_description: 'Low back pain', search_terms: ['low back pain', 'lumbago', 'back pain'] },

  // Codes for special purposes (Chapter 22)
  { code: 'RA01.0', short_description: 'COVID-19, virus identified', search_terms: ['covid', 'coronavirus', 'covid-19', 'sars-cov-2'] },
  { code: 'RA01.1', short_description: 'COVID-19, virus not identified', search_terms: ['covid', 'suspected covid', 'covid-19'] },
];
