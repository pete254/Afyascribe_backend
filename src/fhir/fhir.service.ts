import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { LabOrderItem } from '../lab/entities/lab-order-item.entity';
import { LabResultValue } from '../lab/entities/lab-result-value.entity';
import { LabTest } from '../lab/entities/lab-test.entity';
import { LabAnalyte } from '../lab/entities/lab-analyte.entity';
import { Billing, ServiceType } from '../billing/entities/billing.entity';
import { ServiceCatalogItem } from '../service-catalog/entities/service-catalog.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { User } from '../users/entities/user.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { Radiology } from '../radiology/entities/radiology.entity';
import { RadiologyStatus } from '../radiology/radiology-status.enum';
import { FHIR_PROFILE, FHIR_SYS } from './fhir-systems';

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
    @InjectRepository(LabAnalyte) private readonly labAnalytes: Repository<LabAnalyte>,
    @InjectRepository(Billing) private readonly bills: Repository<Billing>,
    @InjectRepository(ServiceCatalogItem) private readonly catalog: Repository<ServiceCatalogItem>,
    @InjectRepository(Facility) private readonly facilities: Repository<Facility>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PatientVisit) private readonly visits: Repository<PatientVisit>,
    @InjectRepository(Radiology) private readonly studies: Repository<Radiology>,
  ) {}

  private idType(code: string, display: string): Json {
    return { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code, display }] };
  }

  // ── Resource builders ──────────────────────────────────────────────────────

  buildPatient(p: Patient): Json {
    const identifiers: Json[] = [
      { use: 'usual', type: this.idType('MR', 'Medical record number'), system: FHIR_SYS.mrn, value: p.patientId },
    ];
    if (p.idNumber)
      identifiers.push({
        use: 'official',
        type: this.idType('NI', 'National unique individual identifier'),
        system: FHIR_SYS.nationalId,
        value: p.idNumber,
      });
    if (p.shaNumber)
      identifiers.push({
        use: 'official',
        type: this.idType('SB', 'Social Beneficiary Identifier'),
        system: FHIR_SYS.shaId,
        value: p.shaNumber,
      });

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

  /** FHIR Encounter.class from the visit type (ambulatory / inpatient / emergency). */
  private encounterClass(visitType?: string | null): Json {
    const v = (visitType ?? '').toLowerCase();
    const sys = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
    if (v === 'inpatient') return { system: sys, code: 'IMP', display: 'inpatient encounter' };
    if (v === 'emergency') return { system: sys, code: 'EMER', display: 'emergency' };
    return { system: sys, code: 'AMB', display: 'ambulatory' };
  }

  /** An Encounter derived from a SOAP note (the documented consultation),
   *  typed by the day's visit where one is found. */
  buildEncounter(note: SoapNote, visit?: PatientVisit): Json {
    const visitType = visit?.visitType ?? null;
    return {
      resourceType: 'Encounter',
      id: `enc-${note.id}`,
      status: 'finished',
      class: this.encounterClass(visitType),
      type: visitType
        ? [
            {
              coding: [{ system: FHIR_SYS.visitType, code: visitType, display: visitType.replace(/_/g, ' ') }],
              text: visitType.replace(/_/g, ' '),
            },
          ]
        : undefined,
      subject: { reference: `Patient/${note.patientId}` },
      participant: note.createdById
        ? [{ individual: { reference: `Practitioner/prac-${note.createdById}` } }]
        : undefined,
      period: { start: note.createdAt ? new Date(note.createdAt).toISOString() : undefined },
      reasonCode: this.noteDiagnoses(note).map((d) => ({
        coding: [{ system: FHIR_SYS.icd11, code: d.code, display: d.description || undefined }],
        text: d.description || undefined,
      })),
      serviceProvider: note.facilityId ? { reference: `Organization/org-${note.facilityId}` } : undefined,
    };
  }

  /** The facility as a FHIR Organization, identified by its KMHFL code. */
  buildOrganization(f: Facility): Json {
    const identifier: Json[] = [];
    if (f.kmhflCode)
      identifier.push({
        use: 'official',
        type: this.idType('PRN', 'Provider number'),
        system: FHIR_SYS.facility,
        value: f.kmhflCode,
      });
    return {
      resourceType: 'Organization',
      id: `org-${f.id}`,
      identifier: identifier.length ? identifier : undefined,
      active: true,
      name: f.name,
      type: [
        {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' },
          ],
          text: [f.kephLevel, f.ownershipType].filter(Boolean).join(' · ') || undefined,
        },
      ],
      telecom: f.phone ? [{ system: 'phone', value: f.phone }] : undefined,
      address:
        f.county || f.subCounty
          ? [{ district: f.subCounty || undefined, state: f.county || undefined, country: 'KE' }]
          : undefined,
    };
  }

  /** A staff member as a FHIR Practitioner, with their regulatory identifier. */
  buildPractitioner(u: User): Json {
    const identifier: Json[] = [];
    if (u.regulatoryNumber)
      identifier.push({
        use: 'official',
        type: this.idType('MD', u.regulatoryBody || 'Practitioner registration'),
        system: `${FHIR_SYS.practitioner}/${(u.regulatoryBody || 'reg').toLowerCase()}`,
        value: u.regulatoryNumber,
      });
    if (u.practitionerNo)
      identifier.push({ system: `${FHIR_SYS.practitioner}/internal`, value: u.practitionerNo });
    return {
      resourceType: 'Practitioner',
      id: `prac-${u.id}`,
      identifier: identifier.length ? identifier : undefined,
      active: true,
      name: [{ family: u.lastName, given: [u.firstName].filter(Boolean) }],
    };
  }

  /**
   * The patient's insurance/payer as a FHIR Coverage — SHA, private insurance,
   * or self-pay. Returns null for a pure cash patient with no cover on file.
   */
  buildCoverage(p: Patient): Json | null {
    const hasSha = !!p.shaNumber;
    const hasInsurer = !!(p.insurerName && p.insurerName.trim());
    if (!hasSha && !hasInsurer) return null;

    const [code, display] = hasSha
      ? ['SHA', 'Social Health Authority']
      : ['private', 'Private insurance'];
    const validUntil = (p as unknown as { insuranceValidUntil?: string | Date }).insuranceValidUntil;

    return {
      resourceType: 'Coverage',
      id: `cov-${p.id}`,
      identifier: [{ system: FHIR_SYS.coverage, value: p.patientId }],
      status: 'active',
      type: {
        coding: [{ system: FHIR_SYS.coverageType, code, display }],
        text: hasSha ? 'SHA' : p.insurerName || display,
      },
      subscriberId: hasSha ? p.shaNumber : (p as unknown as { membershipNo?: string }).membershipNo || undefined,
      beneficiary: { reference: `Patient/${p.id}` },
      payor: [{ display: hasSha ? 'Social Health Authority' : p.insurerName || 'Insurer' }],
      period: validUntil ? { end: new Date(validUntil).toISOString().slice(0, 10) } : undefined,
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
        requester: rx.doctorId
          ? { reference: `Practitioner/prac-${rx.doctorId}`, display: rx.doctorName || undefined }
          : rx.doctorName
            ? { display: rx.doctorName }
            : undefined,
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
    if (num != null) {
      return {
        valueQuantity: { value: num, unit: v.unit || undefined, system: v.unit ? FHIR_SYS.ucum : undefined, code: v.unit || undefined },
      };
    }
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

  /**
   * A resulted lab-order item → one LOINC-coded Observation per analyte plus a
   * DiagnosticReport that groups them — the shape in the Kenya Core IG's Full
   * Haemogram example (Observation-example-observation-amina-hgb et al.).
   * Analytes are coded with their own LOINC (panel member); the report carries
   * the test's (panel) LOINC.
   */
  buildObservations(
    order: LabOrder,
    item: LabOrderItem,
    loincByTestId: Map<string, LabTest>,
    loincByAnalyteId: Map<string, LabAnalyte> = new Map(),
  ): Json[] {
    const results = item.results ?? [];
    if (!results.length) return [];
    const test = loincByTestId.get(item.labTestId);
    const status = item.verifiedById ? 'final' : item.resultedAt ? 'preliminary' : 'registered';
    const effective = item.resultedAt ? new Date(item.resultedAt).toISOString() : undefined;
    const category = [
      {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' },
        ],
      },
    ];
    const subject = { reference: `Patient/${order.patientId}` };

    const observations: Json[] = results.map((v) => {
      const analyte = v.analyteId ? loincByAnalyteId.get(v.analyteId) : undefined;
      // Single-analyte tests carry the test's own LOINC on their one analyte.
      const loinc = analyte?.loincCode || (results.length === 1 ? test?.loincCode : undefined);
      const code = loinc
        ? { coding: [{ system: FHIR_SYS.loinc, code: loinc, display: v.analyteName }], text: v.analyteName }
        : { text: v.analyteName };
      return {
        resourceType: 'Observation',
        id: `obs-${v.id}`,
        meta: { profile: [FHIR_PROFILE.observation] },
        status,
        category,
        code,
        subject,
        effectiveDateTime: effective,
        issued: item.verifiedById && item.resultedAt ? new Date(item.resultedAt).toISOString() : undefined,
        ...this.valueOf(v),
        interpretation: this.interpretation(v.flag),
        referenceRange: this.refRange(v),
      };
    });

    const reportCode = test?.loincCode
      ? { coding: [{ system: FHIR_SYS.loinc, code: test.loincCode, display: test.loincName || item.testName }], text: item.testName }
      : { text: item.testName };
    const report: Json = {
      resourceType: 'DiagnosticReport',
      id: `lab-${item.id}`,
      meta: { profile: [FHIR_PROFILE.diagnosticReport] },
      status,
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      code: reportCode,
      subject,
      effectiveDateTime: effective,
      issued: item.verifiedById && item.resultedAt ? new Date(item.resultedAt).toISOString() : undefined,
      result: observations.map((o) => ({ reference: `Observation/${o.id}` })),
      conclusion: item.resultNote || undefined,
    };
    return [...observations, report];
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

  /**
   * An imaging study → FHIR DiagnosticReport (radiology), LOINC-coded when it
   * was ordered from the national exam catalogue. Findings + impression become
   * the report's conclusion; status follows the worklist.
   */
  buildImagingReport(study: Radiology): Json {
    const name = study.examName || `${study.type}${study.bodyPart ? ` — ${study.bodyPart}` : ''}`;
    const code = study.loincCode
      ? { coding: [{ system: FHIR_SYS.loinc, code: study.loincCode, display: study.examName || undefined }], text: name }
      : { text: name };
    const status =
      study.status === RadiologyStatus.CANCELLED
        ? 'cancelled'
        : study.reportedAt || study.findings || study.impression
          ? 'final'
          : study.status === RadiologyStatus.COMPLETED
            ? 'partial'
            : 'registered';
    const conclusion = [study.findings, study.impression].filter(Boolean).join('\n\nImpression: ') || study.report || undefined;
    const performer = study.reportedBy?.id ?? study.performedBy?.id;
    return {
      resourceType: 'DiagnosticReport',
      id: `img-${study.id}`,
      status,
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }] },
      ],
      code,
      subject: { reference: `Patient/${study.patient?.id}` },
      effectiveDateTime: (study.performedAt ?? study.createdAt) ? new Date(study.performedAt ?? study.createdAt).toISOString() : undefined,
      issued: study.reportedAt ? new Date(study.reportedAt).toISOString() : undefined,
      performer: performer ? [{ reference: `Practitioner/${performer}` }] : undefined,
      conclusion,
    };
  }

  // ── SHA eClaim (per visit) ───────────────────────────────────────────────────

  private money(v: number): Json {
    return { value: Math.round(v * 100) / 100, currency: 'KES' };
  }

  /**
   * A visit's charges as a FHIR R4 Claim, with the diagnoses (ICD-11), the
   * SHA-coded line items, the coverage and the provider — the payload for SHA
   * eClaims. Bundled with the resources it references so it is self-contained.
   */
  async visitClaimBundle(visitId: string, facilityId: string): Promise<Json> {
    const visit = await this.visits.findOne({ where: { id: visitId, facilityId } });
    if (!visit) throw new NotFoundException('Visit not found');
    const patient = await this.patients.findOne({ where: { id: visit.patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilities.findOne({ where: { id: facilityId } });

    const bills = (await this.bills.find({ where: { visitId, facilityId } })).filter((b) => !b.isDeposit);

    // Diagnoses: the notes written for this patient on the visit day.
    const dayKey = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const vDay = dayKey(
      (visit as unknown as { checkedInAt?: Date; createdAt?: Date }).checkedInAt ?? visit.createdAt,
    );
    const notes = await this.notes.find({ where: { patientId: visit.patientId, facilityId } });
    const dxSeen = new Set<string>();
    const diagnoses: { code: string; description: string }[] = [];
    for (const n of notes) {
      if (dayKey(n.createdAt) !== vDay) continue;
      for (const d of this.noteDiagnoses(n)) {
        if (d.code && !dxSeen.has(d.code)) {
          dxSeen.add(d.code);
          diagnoses.push(d);
        }
      }
    }

    // SHA benefit code per billed service, matched by catalogue name.
    const catalog = await this.catalog.find({ where: { facilityId } });
    const benefitByName = new Map(
      catalog.filter((c) => c.shaBenefitCode).map((c) => [c.name.trim().toLowerCase(), c]),
    );

    const coverage = this.buildCoverage(patient);

    const claim = this.buildClaim(visit.id, patient, facility, bills, diagnoses, benefitByName, !!coverage);

    const entries: Json[] = [{ resource: this.buildPatient(patient) }];
    if (facility) entries.push({ resource: this.buildOrganization(facility) });
    if (coverage) entries.push({ resource: coverage });
    entries.push({ resource: claim });

    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: entries.length,
      entry: entries.map((e) => ({ fullUrl: `urn:uuid:${(e.resource as Json).id}`, ...e })),
    };
  }

  private buildClaim(
    visitId: string,
    patient: Patient,
    facility: Facility | null,
    bills: Billing[],
    diagnoses: { code: string; description: string }[],
    benefitByName: Map<string, ServiceCatalogItem>,
    hasCoverage: boolean,
  ): Json {
    const items = bills.map((b, i) => {
      const match = b.serviceDescription ? benefitByName.get(b.serviceDescription.trim().toLowerCase()) : undefined;
      const product = match?.shaBenefitCode
        ? {
            coding: [{ system: FHIR_SYS.benefit, code: match.shaBenefitCode, display: match.shaBenefitName || b.serviceDescription || undefined }],
            text: b.serviceDescription || undefined,
          }
        : { text: b.serviceDescription || b.serviceType };
      const qty = b.quantity != null ? Number(b.quantity) : 1;
      const amount = Number(b.amount);
      const unit = qty ? amount / qty : amount;
      return {
        sequence: i + 1,
        productOrService: product,
        quantity: { value: qty },
        unitPrice: this.money(unit),
        net: this.money(amount),
      };
    });
    const total = bills.reduce((s, b) => s + Number(b.amount), 0);

    return {
      resourceType: 'Claim',
      id: `claim-${visitId}`,
      status: 'active',
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional' }],
      },
      use: 'claim',
      patient: { reference: `Patient/${patient.id}` },
      created: new Date().toISOString(),
      provider: facility ? { reference: `Organization/org-${facility.id}` } : undefined,
      priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
      diagnosis: diagnoses.map((d, i) => ({
        sequence: i + 1,
        diagnosisCodeableConcept: {
          coding: [{ system: FHIR_SYS.icd11, code: d.code, display: d.description || undefined }],
          text: d.description || undefined,
        },
      })),
      insurance: hasCoverage
        ? [{ sequence: 1, focal: true, coverage: { reference: `Coverage/cov-${patient.id}` } }]
        : [{ sequence: 1, focal: true, coverage: { display: 'Self-pay' } }],
      item: items,
      total: this.money(total),
    };
  }

  // ── Patient Bundle ─────────────────────────────────────────────────────────

  /**
   * A patient's coded record as a FHIR Bundle. `collection` (default) is a
   * readable export; `transaction` is submission-ready for the HIE — resources
   * get urn:uuid fullUrls, internal references are rewired to them, and the
   * Patient is a conditional upsert on its MRN identifier (idempotent).
   */
  async patientBundle(
    patientId: string,
    facilityId: string,
    mode: 'collection' | 'transaction' = 'collection',
  ): Promise<Json> {
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
    const analyteIds = Array.from(
      new Set(
        orders.flatMap((o) => (o.items ?? []).flatMap((i) => (i.results ?? []).map((r) => r.analyteId).filter((x): x is string => !!x))),
      ),
    );
    const analytes = analyteIds.length ? await this.labAnalytes.find({ where: { id: In(analyteIds) } }) : [];
    const loincByAnalyteId = new Map(analytes.map((a) => [a.id, a]));

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

    // Imaging studies → DiagnosticReports (LOINC via the exam snapshot).
    const imaging = await this.studies.find({
      where: { patient: { id: patientId }, facility: { id: facilityId } },
      order: { createdAt: 'DESC' },
    });

    // Facility (Organization) and the staff (Practitioners) referenced by the
    // encounters, prescriptions and imaging reports — so every reference in
    // the bundle resolves.
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const staffIds = Array.from(
      new Set([
        ...notes.map((n) => n.createdById).filter((x): x is string => !!x),
        ...rxs.map((r) => r.doctorId).filter((x): x is string => !!x),
        ...imaging.map((s) => s.reportedBy?.id ?? s.performedBy?.id).filter((x): x is string => !!x),
      ]),
    );
    const staff = staffIds.length ? await this.users.find({ where: { id: In(staffIds) } }) : [];

    // Notes carry no visitId, so match each note to the day's visit (as the
    // reports module does) to type its Encounter.
    const dayKey = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const patientVisits = await this.visits.find({ where: { patientId, facilityId } });
    const visitByDay = new Map<string, PatientVisit>();
    for (const v of patientVisits) {
      const k = dayKey((v as unknown as { checkedInAt?: Date; createdAt?: Date }).checkedInAt ?? v.createdAt);
      if (k && !visitByDay.has(k)) visitByDay.set(k, v);
    }

    const entries: Json[] = [{ resource: this.buildPatient(patient) }];
    if (facility) entries.push({ resource: this.buildOrganization(facility) });
    for (const u of staff) entries.push({ resource: this.buildPractitioner(u) });
    const coverage = this.buildCoverage(patient);
    if (coverage) entries.push({ resource: coverage });
    for (const note of notes) {
      const visit = visitByDay.get(dayKey(note.createdAt));
      entries.push({ resource: this.buildEncounter(note, visit) });
      for (const c of this.buildConditions(note)) entries.push({ resource: c });
    }
    for (const rx of rxs) {
      for (const m of this.buildMedicationRequests(rx, hptByItemId)) entries.push({ resource: m });
    }
    for (const order of orders) {
      for (const item of order.items ?? []) {
        for (const o of this.buildObservations(order, item, loincByTestId, loincByAnalyteId)) entries.push({ resource: o });
      }
    }
    for (const bill of procBills) {
      entries.push({ resource: this.buildProcedure(bill, ichiByName) });
    }
    for (const study of imaging) {
      entries.push({ resource: this.buildImagingReport(study) });
    }

    const resources = entries.map((e) => e.resource as Json);
    if (mode === 'transaction') return this.toTransactionBundle(resources);

    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: resources.length,
      entry: resources.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
    };
  }

  /**
   * Convert built resources into a FHIR transaction Bundle: assign each a
   * urn:uuid fullUrl, rewrite internal references (Type/logicalId → the urn),
   * upsert the Patient conditionally on its MRN, and POST the rest.
   */
  private toTransactionBundle(resources: Json[]): Json {
    const urn = new Map<string, string>();
    for (const r of resources) urn.set(String(r.id), `urn:uuid:${randomUUID()}`);

    const rewrite = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(rewrite);
      else if (o && typeof o === 'object') {
        const obj = o as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (k === 'reference' && typeof obj[k] === 'string') {
            const seg = (obj[k] as string).split('/').pop() ?? '';
            if (urn.has(seg)) obj[k] = urn.get(seg);
          } else rewrite(obj[k]);
        }
      }
    };

    const entry = resources.map((orig) => {
      const r = JSON.parse(JSON.stringify(orig)) as Json;
      const fullUrl = urn.get(String(r.id))!;
      rewrite(r);
      // Idempotent upsert on a stable identifier where one exists, else create.
      const upsertSystem: Record<string, string> = {
        Patient: FHIR_SYS.mrn,
        Organization: FHIR_SYS.facility,
        Practitioner: FHIR_SYS.practitioner,
        Coverage: FHIR_SYS.coverage,
      };
      const type = r.resourceType as string;
      const wanted = upsertSystem[type];
      const ids = (r.identifier as { system?: string; value?: string }[] | undefined) ?? [];
      const match = wanted ? ids.find((i) => i.system && i.value && i.system.startsWith(wanted)) : undefined;
      const request: Json = match
        ? {
            method: 'PUT',
            url: `${type}?identifier=${encodeURIComponent(match.system!)}|${encodeURIComponent(match.value!)}`,
          }
        : { method: 'POST', url: type };
      delete r.id; // identity is carried by fullUrl in a transaction
      return { fullUrl, resource: r, request };
    });

    return { resourceType: 'Bundle', type: 'transaction', entry };
  }
}
