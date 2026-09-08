export enum RadiologyType {
  XRAY = 'X-RAY',
  ULTRASOUND = 'ULTRASOUND',
  CT = 'CT',
  MRI = 'MRI',
  MAMMOGRAPHY = 'MAMMOGRAPHY',
  FLUOROSCOPY = 'FLUOROSCOPY',
}

export const RADIOLOGY_TYPES = Object.values(RadiologyType);

export enum RadiologyPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT = 'STAT',
}

export const RADIOLOGY_PRIORITIES = Object.values(RadiologyPriority);
