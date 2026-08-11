/**
 * The main medical insurers / payers in Kenya, seeded for every facility so a
 * hospital can start billing insurance without typing them in. Owners and admins
 * can add their own or remove any of these afterwards.
 *
 * SHA (Social Health Authority) is the state scheme that replaced NHIF; both are
 * listed since claims against legacy NHIF cover still occur.
 */
export const KENYA_INSURERS: { name: string; code: string }[] = [
  { name: 'SHA — Social Health Authority', code: 'SHA' },
  { name: 'NHIF (legacy)', code: 'NHIF' },
  { name: 'AAR Insurance', code: 'AAR' },
  { name: 'Jubilee Health Insurance', code: 'JUBILEE' },
  { name: 'Britam', code: 'BRITAM' },
  { name: 'CIC Insurance', code: 'CIC' },
  { name: 'APA Insurance', code: 'APA' },
  { name: 'Madison Insurance', code: 'MADISON' },
  { name: 'UAP Old Mutual', code: 'UAP' },
  { name: 'Sanlam (Saham)', code: 'SANLAM' },
  { name: 'First Assurance', code: 'FIRSTASSUR' },
  { name: 'Heritage Insurance', code: 'HERITAGE' },
  { name: 'GA Insurance', code: 'GA' },
  { name: 'Pacis Insurance', code: 'PACIS' },
  { name: 'ICEA Lion', code: 'ICEALION' },
  { name: 'Kenbright', code: 'KENBRIGHT' },
  { name: 'Liaison Group', code: 'LIAISON' },
  { name: 'M-TIBA', code: 'MTIBA' },
  { name: 'Prudential', code: 'PRUDENTIAL' },
  { name: 'Old Mutual', code: 'OLDMUTUAL' },
];
