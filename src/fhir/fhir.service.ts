import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabOrderItem } from '../lab/entities/lab-order-item.entity';
import { LabResultValue } from '../lab/entities/lab-result-value.entity';
import { LabTest } from '../lab/entities/lab-test.entity';
import { Billing, ServiceType } from '../billing/entities/billing.entity';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
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
    @InjectRepository(LabOrder) private readonly labOrders: Repository<LabOrder>,
    @InjectRepository(LabTest) private readonly labTests: Repository<LabTest>,
    @InjectRepository(Billing) private readonly bills: Repository<Billing>,
    @InjectRepository(ServiceCatalogItem) private readonly catalog: Repository<ServiceCatalogItem>,
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

  private interpretation(flag: string | null): Json[] | undefined {
    const map: Record<string, string> = { high: 'H', low: 'L', critical: 'AA', abnormal: 'A', normal: 'N' };
    const code = flag ? map[flag.toLowerCase()] : undefined;
    if (!code) return undefined;
    return [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code }] },
    ];
  }

  private valueOf(v: LabResultValue): Json {
    const num = v.value != null && v.value !== '' && !Number.isNaN(Number(v.value)) ? Number(v.value) : null;
    if (num != null) return { valueQuantity: { value: num, unit: v.unit || undefined } };
    return { valueString: v.value ?? undefined };
  }

  private refRange(v: LabResultValue): Json[] | undefined {
    if (v.refLow == null && v.refHigh == null && !v.refText) return undefined;
    return [
      {
        low: v.refLow != null ? { value: Number(v.refLow), unit: v.unit || undefined } : undefined,
        high: v.refHigh != null ? { value: Number(v.refHigh), unit: v.unit || undefined } : undefined,
        text: v.refText || undefined,
      },
    ];
  }

  /** One Observation per resulted lab-order item (LOINC-coded when the test is mapped). */
  buildObservations(order: LabOrder, item: LabOrderItem, loincByTestId: Map<string, LabTest>): Json[] {
    const results = item.results ?? [];
    if (!results.length) return [];
    const test = loincByTestId.get(item.labTestId);
    const code = test?.loincCode
      ? { coding: [{ system: FHIR_SYS.loinc, code: test.loincCode, display: test.loincName || item.testName }], text: item.testName }
      : { text: item.testName };
    const status = item.resultedAt ? 'final' : 'preliminary';
    const effective = item.resultedAt ? new Date(item.resultedAt).toISOString() : undefined;

    const base: Json = {
      resourceType: 'Observation',
      id: `obs-${item.id}`,
      status,
      category: [
        {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' },
          ],
        },
      ],
      code,
      subject: { reference: `Patient/${order.patientId}` },
      effectiveDateTime: effective,
    };

    if (results.length === 1) {
      const v = results[0];
      return [{ ...base, ...this.valueOf(v), interpretation: this.interpretation(v.flag), referenceRange: this.refRange(v) }];
    }
    // Multiple analytes → components on one Observation.
    return [
      {
        ...base,
        component: results.map((v) => ({
          code: { text: v.analyteName },
          ...this.valueOf(v),
          interpretation: this.interpretation(v.flag),
          referenceRange: this.refRange(v),
        })),
      },
    ];
  }

  /** A billed procedure → FHIR Procedure, ICHI-coded when the catalogue item is mapped. */
  buildProcedure(bill: Billing, ichiByName: Map<string, ServiceCatalogItem>): Json {
    const match = bill.serviceDescription ? ichiByName.get(bill.serviceDescription.trim().toLowerCase()) : undefined;
    const code = match?.knhtsCode
      ? { coding: [{ system: FHIR_SYS.ichi, code: match.knhtsCode, display: match.knhtsName || bill.serviceDescription || undefined }], text: bill.serviceDescription || undefined }
      : { text: bill.serviceDescription || 'Procedure' };
    return {
      resourceType: 'Procedure',
      id: `proc-${bill.id}`,
      status: 'completed',
      code,
      subject: { reference: `Patient/${bill.patientId}` },
      performedDateTime: bill.createdAt ? new Date(bill.createdAt as unknown as string).toISOString() : undefined,
    };
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

    // Lab results → Observations (LOINC via the test mapping).
    const orders = await this.labOrders.find({ where: { patientId, facilityId }, order: { createdAt: 'DESC' } });
    const testIds = Array.from(
      new Set(orders.flatMap((o) => (o.items ?? []).map((i) => i.labTestId).filter(Boolean))),
    );
    const tests = testIds.length ? await this.labTests.find({ where: { id: In(testIds) } }) : [];
    const loincByTestId = new Map(tests.map((t) => [t.id, t]));

    // Billed procedures → Procedures (ICHI via the catalogue mapping).
    const procBills = await this.bills.find({
      where: { patientId, facilityId, serviceType: ServiceType.PROCEDURE },
      order: { createdAt: 'DESC' },
    });
    const codedCatalog = await this.catalog.find({ where: { facilityId } });
    const ichiByName = new Map(
      codedCatalog
        .filter((c) => c.knhtsCode)
        .map((c) => [c.name.trim().toLowerCase(), c]),
    );

    const entries: Json[] = [{ resource: this.buildPatient(patient) }];
    for (const note of notes) {
      entries.push({ resource: this.buildEncounter(note) });
      for (const c of this.buildConditions(note)) entries.push({ resource: c });
    }
    for (const rx of rxs) {
      for (const m of this.buildMedicationRequests(rx, hptByItemId)) entries.push({ resource: m });
    }
    for (const order of orders) {
      for (const item of order.items ?? []) {
        for (const o of this.buildObservations(order, item, loincByTestId)) entries.push({ resource: o });
      }
    }
    for (const bill of procBills) {
      entries.push({ resource: this.buildProcedure(bill, ichiByName) });
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
