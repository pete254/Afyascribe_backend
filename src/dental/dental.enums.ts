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
