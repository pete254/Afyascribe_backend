import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { FHIR_SYS } from './fhir-systems';

type Json = Record<string, unknown>;

/**
 * Builds FHIR R4 resources from AfyaScribe's now-standardized clinical data for
 * export to the Kenya HIE / Shared Health Record. Read-only: it assembles a
 * patient's Bundle; the authenticated submission to the HIE is a later step.
 */
@Injectable()
export class FhirService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(SoapNote) private readonly notes: Repository<SoapNote>,
    @InjectRepository(Prescription) private readonly prescriptions: Repository<Prescription>,
    @InjectRepository(InventoryItem) private readonly items: Repository<InventoryItem>,
  ) {}

  // ── Resource builders ──────────────────────────────────────────────────────

  buildPatient(p: Patient): Json {
    const identifiers: Json[] = [
      { system: FHIR_SYS.mrn, value: p.patientId, use: 'usual' },
    ];
    if (p.idNumber) identifiers.push({ system: FHIR_SYS.nationalId, value: p.idNumber, use: 'official' });

    const address =
      p.county || p.subCounty
        ? [{ district: p.subCounty || undefined, state: p.county || undefined, country: p.nationality || 'KE' }]
        : undefined;

    return {
      resourceType: 'Patient',
      id: p.id,
      identifier: identifiers,
      active: true,
      name: [{ family: p.lastName, given: [p.firstName].filter(Boolean) }],
      gender: this.fhirGender(p.gender),
      birthDate: p.dateOfBirth || undefined,
      telecom: p.phoneNumber ? [{ system: 'phone', value: p.phoneNumber, use: 'mobile' }] : undefined,
      address,
    };
  }

  private fhirGender(g?: string): string {
    const v = (g ?? '').toLowerCase();
    if (v.startsWith('m')) return 'male';
    if (v.startsWith('f')) return 'female';
    return 'unknown';
  }

  /** An Encounter derived from a SOAP note (the documented consultation). */
  buildEncounter(note: SoapNote): Json {
    return {
      resourceType: 'Encounter',
      id: `enc-${note.id}`,
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      subject: { reference: `Patient/${note.patientId}` },
      period: { start: note.createdAt ? new Date(note.createdAt).toISOString() : undefined },
      reasonCode: this.noteDiagnoses(note).map((d) => ({
        coding: [{ system: FHIR_SYS.icd11, code: d.code, display: d.description || undefined }],
        text: d.description || undefined,
      })),
    };
  }

  private noteDiagnoses(note: SoapNote): { code: string; description: string }[] {
    if (note.icd11Codes && note.icd11Codes.length) return note.icd11Codes;
    if (note.icd11Code) return [{ code: note.icd11Code, description: note.icd11Description ?? '' }];
    return [];
  }

  buildConditions(note: SoapNote): Json[] {
    return this.noteDiagnoses(note).map((d, i) => ({
      resourceType: 'Condition',
      id: `cond-${note.id}-${i}`,
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'encounter-diagnosis',
              display: 'Encounter Diagnosis',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: FHIR_SYS.icd11, code: d.code, display: d.description || undefined }],
        text: d.description || note.diagnosis || undefined,
      },
      subject: { reference: `Patient/${note.patientId}` },
      encounter: { reference: `Encounter/enc-${note.id}` },
      recordedDate: note.createdAt ? new Date(note.createdAt).toISOString() : undefined,
    }));
  }

  buildMedicationRequests(rx: Prescription, hptByItemId: Map<string, InventoryItem>): Json[] {
    return (rx.items ?? []).map((it, i) => {
      const item = it.itemId ? hptByItemId.get(it.itemId) : undefined;
      const medication =
        item?.knhtsCode
          ? { coding: [{ system: FHIR_SYS.hpt, code: item.knhtsCode, display: item.knhtsName || it.medication }], text: it.medication }
          : { text: it.medication };
      const dosageText = [it.dosage, it.frequency, it.duration].filter(Boolean).join(' · ') || undefined;
      return {
        resourceType: 'MedicationRequest',
        id: `medreq-${rx.id}-${i}`,
        status: rx.status === 'dispensed' ? 'completed' : 'active',
        intent: 'order',
        medicationCodeableConcept: medication,
        subject: { reference: `Patient/${rx.patientId}` },
        authoredOn: rx.createdAt ? new Date(rx.createdAt as unknown as string).toISOString() : undefined,
        requester: rx.doctorName ? { display: rx.doctorName } : undefined,
        dosageInstruction: dosageText ? [{ text: dosageText }] : undefined,
      };
    });
  }

  // ── Patient Bundle ─────────────────────────────────────────────────────────

  /** A collection Bundle of a patient's coded record (Patient + Encounters +
   *  Conditions + MedicationRequests). Facility-scoped. */
  async patientBundle(patientId: string, facilityId: string): Promise<Json> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const notes = await this.notes.find({
      where: { patientId, facilityId },
      order: { createdAt: 'DESC' },
    });
    const rxs = await this.prescriptions.find({
      where: { patientId, facilityId },
      order: { createdAt: 'DESC' },
    });

    // Resolve HPT codes for any dispensed/prescribed inventory items in one query.
    const itemIds = Array.from(
      new Set(rxs.flatMap((r) => (r.items ?? []).map((i) => i.itemId).filter((x): x is string => !!x))),
    );
    const items = itemIds.length ? await this.items.find({ where: { id: In(itemIds) } }) : [];
    const hptByItemId = new Map(items.map((i) => [i.id, i]));

    const entries: Json[] = [{ resource: this.buildPatient(patient) }];
    for (const note of notes) {
      entries.push({ resource: this.buildEncounter(note) });
      for (const c of this.buildConditions(note)) entries.push({ resource: c });
    }
    for (const rx of rxs) {
      for (const m of this.buildMedicationRequests(rx, hptByItemId)) entries.push({ resource: m });
    }

    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: entries.length,
      entry: entries.map((e) => ({
        fullUrl: `urn:uuid:${(e.resource as Json).id}`,
        ...e,
      })),
    };
  }
}
