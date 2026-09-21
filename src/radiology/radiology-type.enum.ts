export enum RadiologyType {
  XRAY = 'X-RAY',
  ULTRASOUND = 'ULTRASOUND',
  CT = 'CT',
  MRI = 'MRI',
  MAMMOGRAPHY = 'MAMMOGRAPHY',
  FLUOROSCOPY = 'FLUOROSCOPY',
  NUCLEAR = 'NUCLEAR',
  OTHER = 'OTHER',
}

/**
 * Map a KNHTS imaging subdomain (e.g. "CT Scan", "X-Ray", "PET Scan") onto our
 * modality enum, so an exam picked from the national catalogue lands in the
 * right worklist bucket.
 */
export function modalityToType(modality?: string | null): RadiologyType {
  const m = (modality ?? '').toLowerCase();
  if (!m) return RadiologyType.OTHER;
  if (m.includes('mammo')) return RadiologyType.MAMMOGRAPHY;
  if (m.includes('fluoro')) return RadiologyType.FLUOROSCOPY;
  if (m.includes('x-ray') || m.includes('xray') || m.includes('x ray') || m.includes('radiograph')) return RadiologyType.XRAY;
  if (m.includes('ultra') || m.includes('sono') || m.includes('doppler') || m.includes('echo')) return RadiologyType.ULTRASOUND;
  if (m.startsWith('ct') || m.includes('computed tomo')) return RadiologyType.CT;
  if (m.startsWith('mr') || m.includes('magnetic')) return RadiologyType.MRI;
  if (m.includes('pet') || m.includes('nuclear') || m.includes('spect') || m.includes('scintigraph')) return RadiologyType.NUCLEAR;
  return RadiologyType.OTHER;
}

export const RADIOLOGY_TYPES = Object.values(RadiologyType);

export enum RadiologyPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT = 'STAT',
}

export const RADIOLOGY_PRIORITIES = Object.values(RadiologyPriority);
