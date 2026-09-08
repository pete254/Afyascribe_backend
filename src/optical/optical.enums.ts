export enum OpticalRxType {
  DISTANCE = 'DISTANCE',
  READING = 'READING',
  BIFOCAL = 'BIFOCAL',
  PROGRESSIVE = 'PROGRESSIVE',
  CONTACT_LENS = 'CONTACT_LENS',
}

export const OPTICAL_RX_TYPES = Object.values(OpticalRxType);

export enum OpticalStatus {
  EXAM = 'EXAM',           // examination in progress
  PRESCRIBED = 'PRESCRIBED', // refraction done, prescription issued
  DISPENSED = 'DISPENSED',   // spectacles / lenses dispensed
  CANCELLED = 'CANCELLED',
}

export const OPTICAL_STATUSES = Object.values(OpticalStatus);
