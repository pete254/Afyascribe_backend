export enum DentalProcedure {
  EXAM = 'EXAM',
  SCALING = 'SCALING', // cleaning / scaling & polishing
  FILLING = 'FILLING',
  EXTRACTION = 'EXTRACTION',
  ROOT_CANAL = 'ROOT_CANAL',
  CROWN = 'CROWN',
  BRIDGE = 'BRIDGE',
  DENTURE = 'DENTURE',
  IMPLANT = 'IMPLANT',
  WHITENING = 'WHITENING',
  XRAY = 'XRAY',
  OTHER = 'OTHER',
}

export const DENTAL_PROCEDURES = Object.values(DentalProcedure);

export enum DentalStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const DENTAL_STATUSES = Object.values(DentalStatus);

/**
 * Map an ICHI dental code (KAE.* teeth, KAG.* gums) onto the procedure kind
 * the tooth chart understands. ICHI's action axis (middle segment): JE/JK =
 * extraction, JG = scaling, MK = restoration, ML = root canal, BA = imaging.
 */
export function ichiToDentalProcedure(code?: string | null, name?: string | null): DentalProcedure {
  const c = (code ?? '').toUpperCase();
  const n = (name ?? '').toLowerCase();
  const action = c.split('.')[1] ?? '';
  if (c.startsWith('KAE.')) {
    if (action === 'JE' || action === 'JK') return DentalProcedure.EXTRACTION;
    if (action === 'JG') return DentalProcedure.SCALING;
    if (action === 'MK') return DentalProcedure.FILLING;
    if (action === 'ML') return DentalProcedure.ROOT_CANAL;
    if (action === 'BA') return DentalProcedure.XRAY;
    if (action === 'AA' || action === 'AD') return DentalProcedure.EXAM;
  }
  if (n.includes('crown')) return DentalProcedure.CROWN;
  if (n.includes('bridge')) return DentalProcedure.BRIDGE;
  if (n.includes('denture')) return DentalProcedure.DENTURE;
  if (n.includes('implant')) return DentalProcedure.IMPLANT;
  if (n.includes('whiten') || n.includes('bleach')) return DentalProcedure.WHITENING;
  if (n.includes('extraction')) return DentalProcedure.EXTRACTION;
  if (n.includes('scaling')) return DentalProcedure.SCALING;
  if (n.includes('restoration') || n.includes('filling')) return DentalProcedure.FILLING;
  if (n.includes('root canal')) return DentalProcedure.ROOT_CANAL;
  if (n.includes('x-ray') || n.includes('radiograph')) return DentalProcedure.XRAY;
  if (n.includes('assessment') || n.includes('examination')) return DentalProcedure.EXAM;
  return DentalProcedure.OTHER;
}
