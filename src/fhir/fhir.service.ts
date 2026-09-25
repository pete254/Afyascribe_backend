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
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { Radiology } from '../radiology/entities/radiology.entity';
import { PatientAllergy } from '../allergies/entities/patient-allergy.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { PatientIdentifier } from '../patients/entities/patient-identifier.entity';
import { identifierType } from '../patients/data/identifier-types';
import { AllergiesService, MedicationListEntry } from '../allergies/allergies.service';
import { RadiologyStatus } from '../radiology/radiology-status.enum';
import { FHIR_PROFILE, FHIR_SYS } from './fhir-systems';
import { OBSTETRIC_LOINC, SUMMARY_LOINC, narrative } from './clinical-summary';
import { collectionBundle, stampEncounter, validateShrBundle } from './shr';

/** The EpisodeOfCare id for a visit — one place, so references cannot drift. */
const visitEpisodeId = (visitId: string) => `visit-episode-${visitId}`;
import { Appointment } from '../appointments/entities/appointment.entity';
import { FamilyHistory } from '../family-history/entities/family-history.entity';
import { FAMILY_RELATIONSHIP_SYSTEM, relationshipOf } from '../family-history/family-history.enums';
import { Immunisation } from '../immunisation/entities/immunisation.entity';
import { vaccineLabel } from '../immunisation/data/schedule';
import { Pregnancy } from '../maternity/entities/pregnancy.entity';
import { AncContact } from '../maternity/entities/anc-contact.entity';
import { PncContact } from '../maternity/entities/pnc-contact.entity';
import { gestationOn, lmpFromEdd, resolveDating } from '../maternity/gestation';
import { PNC_WINDOW_LABEL } from '../maternity/data/schedules';
import { Delivery } from '../maternity/entities/delivery.entity';
import { Birth } from '../maternity/entities/birth.entity';
import { BIRTH_OUTCOME_LABEL, DELIVERY_MODE_LABEL } from '../maternity/maternity.enums';

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
    @InjectRepository(PatientAllergy) private readonly allergies: Repository<PatientAllergy>,
    @InjectRepository(PatientProblem) private readonly problems: Repository<PatientProblem>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(FamilyHistory) private readonly familyHistory: Repository<FamilyHistory>,
    @InjectRepository(Immunisation) private readonly immunisations: Repository<Immunisation>,
    @InjectRepository(Pregnancy) private readonly pregnancies: Repository<Pregnancy>,
    @InjectRepository(AncContact) private readonly ancContacts: Repository<AncContact>,
    @InjectRepository(PncContact) private readonly pncContacts: Repository<PncContact>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(Birth) private readonly birthRecords: Repository<Birth>,
    private readonly meds: AllergiesService,
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

    // Kenya's residence hierarchy maps onto FHIR as county → state,
    // sub-county → district, ward and village/landmark → address lines.
    const lines = [p.physicalAddress, p.village, p.ward].filter(Boolean) as string[];
    const address =
      p.county || p.subCounty || lines.length
        ? [
            {
              line: lines.length ? lines : undefined,
              district: p.subCounty || undefined,
              state: p.county || undefined,
              postalCode: p.postalCode || undefined,
              country: p.nationality || 'KE',
            },
          ]
        : undefined;
    // Every identifier the patient holds, typed against the national Kenya
    // Patient Identifiers list where it publishes a code. De-duplicated so a
    // value already emitted above (national ID, SHA) is not repeated.
    const seen = new Set(identifiers.map((i) => String(i.value)));
    for (const extra of (p as Patient & { identifiers?: PatientIdentifier[] }).identifiers ?? []) {
      if (!extra.value || seen.has(extra.value)) continue;
      seen.add(extra.value);
      const meta = identifierType(extra.type);
      identifiers.push({
        use: extra.isPrimary ? 'official' : 'secondary',
        type: meta?.fhirType ? this.idType(meta.fhirType, meta.label) : { text: meta?.label ?? extra.type },
        system: extra.typeSystem
          ? `${FHIR_SYS.patientIdentifier}/${extra.type}`
          : `${FHIR_SYS.mrn}/${extra.type}`,
        value: extra.value,
      });
    }


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
      // The Shared Health Record requires every Encounter to reference the
      // visit's EpisodeOfCare; without it the record arrives as a loose
      // encounter belonging to nothing.
      episodeOfCare: visit ? [{ reference: `EpisodeOfCare/${visitEpisodeId(visit.id)}` }] : undefined,
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

  /**
   * A problem-list entry → FHIR Condition, carrying its real clinical status.
   * Note-derived Conditions always claimed `active`, so a condition resolved
   * years ago still exported as current; the problem list knows better.
   */
  buildProblemCondition(p: PatientProblem): Json {
    return {
      resourceType: 'Condition',
      id: `prob-${p.id}`,
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: p.status }],
      },
      verificationStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: p.verificationStatus },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: p.category,
              display: p.category === 'problem-list-item' ? 'Problem List Item' : 'Encounter Diagnosis',
            },
          ],
        },
      ],
      severity: p.severity
        ? { coding: [{ system: FHIR_SYS.conditionSeverity, code: p.severity, display: p.severity }] }
        : undefined,
      code: p.code
        ? { coding: [{ system: FHIR_SYS.icd11, code: p.code, display: p.display }], text: p.display }
        : { text: p.display },
      subject: { reference: `Patient/${p.patientId}` },
      encounter: p.sourceNoteId ? { reference: `Encounter/enc-${p.sourceNoteId}` } : undefined,
      onsetDateTime: p.onsetDate ?? undefined,
      abatementDateTime: p.abatementDate ?? undefined,
      recordedDate: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      recorder: p.recordedByName ? { display: p.recordedByName } : undefined,
      note: p.note ? [{ text: p.note }] : undefined,
    };
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
    const status = item.amendedAt ? 'amended' : item.verifiedById ? 'final' : item.resultedAt ? 'preliminary' : 'registered';
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

  /**
   * A recorded allergy → FHIR AllergyIntolerance, coded to the national
   * allergen list and, for a drug allergy, to the HPT active component. This is
   * the resource the DHA criterion means by recording HPT allergies into the
   * HPT Registry.
   */
  buildAllergyIntolerance(a: PatientAllergy): Json {
    const coding: Json[] = [];
    if (a.hptCode) coding.push({ system: FHIR_SYS.hptComponent, code: a.hptCode, display: a.hptName || a.allergenName });
    if (a.knhtsCode) coding.push({ system: FHIR_SYS.allergen, code: a.knhtsCode, display: a.allergenName });

    const clinical =
      a.status === 'active' ? 'active' : a.status === 'resolved' ? 'resolved' : a.status === 'inactive' ? 'inactive' : null;
    const categoryOf: Record<string, string> = {
      medication: 'medication',
      food: 'food',
      environment: 'environment',
      biologic: 'biologic',
    };
    const category = categoryOf[a.allergenType];
    const reactions = (a.manifestations ?? []).map((m) => ({
      manifestation: [
        m.code
          ? { coding: [{ system: FHIR_SYS.allergyManifestation, code: m.code, display: m.display }], text: m.display }
          : { text: m.display },
      ],
      severity: a.severity === 'severe' ? 'severe' : a.severity === 'moderate' ? 'moderate' : a.severity === 'mild' ? 'mild' : undefined,
    }));

    return {
      resourceType: 'AllergyIntolerance',
      id: `allergy-${a.id}`,
      clinicalStatus: clinical
        ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: clinical }] }
        : undefined,
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: a.status === 'entered-in-error' ? 'entered-in-error' : a.verificationStatus,
          },
        ],
      },
      type: a.kind,
      category: category ? [category] : undefined,
      criticality: a.criticality ?? undefined,
      code: coding.length ? { coding, text: a.allergenName } : { text: a.allergenName },
      patient: { reference: `Patient/${a.patientId}` },
      onsetDateTime: a.onsetDate ?? undefined,
      recordedDate: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
      recorder: a.recordedByName ? { display: a.recordedByName } : undefined,
      lastOccurrence: a.lastOccurrence ?? undefined,
      note: a.note ? [{ text: a.note }] : undefined,
      reaction: reactions.length ? reactions : undefined,
    };
  }

  /**
   * A line of the patient's medication list → FHIR MedicationStatement, coded
   * to its HPT product. `status` reflects whether the written course still
   * runs; where no duration was recorded we say `unknown` rather than assert
   * the patient is still taking it.
   */
  buildMedicationStatement(patientId: string, m: MedicationListEntry): Json {
    const status = m.activeBasis === 'within-duration' ? 'active' : m.activeBasis === 'ended' ? 'completed' : 'unknown';
    const dosageText = [m.dosage, m.frequency, m.duration, m.instructions].filter(Boolean).join(' · ') || undefined;
    return {
      resourceType: 'MedicationStatement',
      id: `medstmt-${m.prescriptionId}-${(m.itemId ?? m.medication).slice(0, 8)}`,
      status,
      medicationCodeableConcept: m.hptCode
        ? { coding: [{ system: FHIR_SYS.hpt, code: m.hptCode, display: m.medication }], text: m.medication }
        : { text: m.medication },
      subject: { reference: `Patient/${patientId}` },
      effectivePeriod: { start: m.prescribedOn || undefined, end: m.expectedEnd ?? undefined },
      dateAsserted: m.prescribedOn || undefined,
      informationSource: m.prescriber ? { display: m.prescriber } : undefined,
      dosage: dosageText ? [{ text: dosageText }] : undefined,
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

    // Allergies → AllergyIntolerance, and the medication list → MedicationStatement.
    // Both are DHA certification criteria in their own right.
    const allergies = await this.allergies.find({ where: { facilityId, patientId } });
    const problems = await this.problems.find({ where: { facilityId, patientId } });
    const familyHistory = await this.familyHistory.find({ where: { facilityId, patientId } });
    const immunisations = await this.immunisations.find({ where: { facilityId, patientId } });
    const pregnancies = await this.pregnancies.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
    });
    const pregnancyIds = pregnancies.map((x) => x.id);
    const [ancContacts, pncVisits, deliveries, babies] = pregnancyIds.length
      ? await Promise.all([
          this.ancContacts.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
          this.pncContacts.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
          this.deliveries.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
          this.birthRecords.find({ where: { facilityId, pregnancyId: In(pregnancyIds) } }),
        ])
      : [[] as AncContact[], [] as PncContact[], [] as Delivery[], [] as Birth[]];
    // Diagnoses on notes that pre-date the problem list still need exporting;
    // once a note has fed the list, the list is the better record.
    const notesInList = new Set(problems.map((p) => p.sourceNoteId).filter(Boolean) as string[]);
    const medications = await this.meds.medications(facilityId, patientId);

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
      if (!notesInList.has(note.id)) {
        for (const c of this.buildConditions(note)) entries.push({ resource: c });
      }
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
    for (const p of problems) {
      entries.push({ resource: this.buildProblemCondition(p) });
    }
    for (const f of familyHistory) {
      if (f.status === 'entered-in-error') continue;
      entries.push({ resource: this.buildFamilyMemberHistory(f) });
    }
    for (const i of immunisations) {
      entries.push({ resource: this.buildImmunization(i) });
    }
    for (const preg of pregnancies) {
      // The episode first: the encounters below all hang off it.
      entries.push({ resource: this.buildPregnancyEpisode(preg) });
      for (const r of this.buildPregnancyObservations(preg)) entries.push({ resource: r });
    }
    for (const d of deliveries) {
      for (const r of this.buildDelivery(d)) entries.push({ resource: r });
    }
    for (const b of babies) {
      for (const r of this.buildBirth(b)) entries.push({ resource: r });
    }
    for (const c of ancContacts) {
      for (const r of this.buildAncContact(c)) entries.push({ resource: r });
    }
    for (const c of pncVisits) {
      for (const r of this.buildPncContact(c)) entries.push({ resource: r });
    }
    for (const a of allergies) {
      entries.push({ resource: this.buildAllergyIntolerance(a) });
    }
    for (const m of medications) {
      entries.push({ resource: this.buildMedicationStatement(patientId, m) });
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
   * A relative's history → FHIR FamilyMemberHistory. One resource per relative
   * carrying all their conditions, which is how the resource is shaped: a
   * mother with diabetes and hypertension is one relative, not two.
   */
  buildFamilyMemberHistory(f: FamilyHistory): Json {
    const rel = relationshipOf(f.relationship);
    return {
      resourceType: 'FamilyMemberHistory',
      id: `famhx-${f.id}`,
      status: f.status,
      patient: { reference: `Patient/${f.patientId}` },
      date: f.createdAt ? new Date(f.createdAt).toISOString() : undefined,
      name: f.name ?? undefined,
      relationship: {
        coding: [{ system: FAMILY_RELATIONSHIP_SYSTEM, code: f.relationship, display: rel?.label }],
        text: rel?.label ?? f.relationship,
      },
      sex: f.gender ? { text: f.gender } : undefined,
      bornDate: f.bornYear ? String(f.bornYear) : undefined,
      deceasedAge: f.deceased && f.ageAtDeath ? { value: f.ageAtDeath, unit: 'a', system: FHIR_SYS.ucum, code: 'a' } : undefined,
      deceasedBoolean: f.deceased && !f.ageAtDeath ? true : undefined,
      note: f.note ? [{ text: f.note }] : undefined,
      condition: (f.conditions ?? []).map((c) => ({
        code: c.code
          ? { coding: [{ system: FHIR_SYS.icd11, code: c.code, display: c.display }], text: c.display }
          : { text: c.display },
        contributedToDeath: c.contributedToDeath || undefined,
        onsetAge: c.onsetAge != null ? { value: c.onsetAge, unit: 'a', system: FHIR_SYS.ucum, code: 'a' } : undefined,
        note: c.note ? [{ text: c.note }] : undefined,
      })),
    };
  }

  /**
   * A dose given → FHIR Immunization, coded to the vaccine code Kenya's
   * national schedule uses. `primarySource` is false for a dose brought in on
   * a home-based card: the record is real, but this facility did not give it.
   */
  buildImmunization(i: Immunisation): Json {
    return {
      resourceType: 'Immunization',
      id: `imm-${i.id}`,
      status: 'completed',
      vaccineCode: {
        coding: [{ system: FHIR_SYS.vaccine, code: i.vaccine, display: vaccineLabel(i.vaccine) }],
        text: vaccineLabel(i.vaccine),
      },
      patient: { reference: `Patient/${i.patientId}` },
      occurrenceDateTime: i.givenDate,
      primarySource: i.givenHere,
      lotNumber: i.batchNo ?? undefined,
      expirationDate: i.expiryDate ?? undefined,
      site: i.site ? { text: i.site } : undefined,
      performer: i.givenByName ? [{ actor: { display: i.givenByName } }] : undefined,
      protocolApplied: [{ doseNumberPositiveInt: i.dose }],
      note: i.note ? [{ text: i.note }] : undefined,
    };
  }

  /**
   * A pregnancy → the observations that describe it: status, dating, gestation
   * and obstetric history. FHIR has no Pregnancy resource; the IPS carries the
   * same facts as Observations against the patient, which is what is built here.
   */
  buildPregnancyObservations(p: Pregnancy): Json[] {
    const dated = resolveDating(p);
    const on = p.status === 'active' ? new Date().toISOString().slice(0, 10) : (p.outcomeDate ?? null);
    const g = on ? gestationOn(p, on) : null;
    const subject = { reference: `Patient/${p.patientId}` };
    const effective = p.status === 'active' ? new Date().toISOString().slice(0, 10) : p.outcomeDate;

    const obs = (suffix: string, code: { code: string; display: string }, value: Json): Json => ({
      resourceType: 'Observation',
      id: `preg-${p.id}-${suffix}`,
      meta: { profile: [FHIR_PROFILE.observation] },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'social-history',
            },
          ],
        },
      ],
      code: { coding: [{ system: FHIR_SYS.loinc, ...code }], text: code.display },
      subject,
      effectiveDateTime: effective ?? undefined,
      ...value,
    });

    const out: Json[] = [
      obs('status', OBSTETRIC_LOINC.pregnancyStatus, {
        valueCodeableConcept: { text: p.status === 'active' ? 'Pregnant' : `Ended — ${p.outcome ?? 'not recorded'}` },
      }),
    ];

    if (p.lmp) out.push(obs('lmp', OBSTETRIC_LOINC.lmp, { valueDateTime: p.lmp }));
    if (dated) out.push(obs('edd', OBSTETRIC_LOINC.edd, { valueDateTime: dated.edd }));
    if (g) {
      out.push(
        obs('ga', OBSTETRIC_LOINC.gestationalAge, {
          valueQuantity: { value: g.weeks, unit: 'weeks', system: FHIR_SYS.ucum, code: 'wk' },
        }),
      );
    }
    if (p.gravida != null) {
      out.push(obs('gravida', OBSTETRIC_LOINC.gravida, { valueQuantity: { value: p.gravida, unit: '{#}' } }));
    }
    if (p.para != null) {
      out.push(obs('para', OBSTETRIC_LOINC.para, { valueQuantity: { value: p.para, unit: '{#}' } }));
    }
    return out;
  }

  /**
   * An antenatal contact → an Encounter plus the observations taken at it.
   * Gestation is the figure recorded on the day, not one recomputed from a
   * later revision of the dates.
   */
  buildAncContact(c: AncContact): Json[] {
    const subject = { reference: `Patient/${c.patientId}` };
    const encounterId = `anc-${c.id}`;
    const out: Json[] = [
      {
        resourceType: 'Encounter',
        id: encounterId,
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        type: [{ text: `Antenatal contact ${c.contactNumber}` }],
        subject,
        episodeOfCare: [{ reference: `EpisodeOfCare/preg-episode-${c.pregnancyId}` }],
        period: { start: c.contactDate, end: c.contactDate },
        participant: c.recordedByName ? [{ individual: { display: c.recordedByName } }] : undefined,
        reasonCode: [{ text: 'Antenatal care' }],
      },
    ];

    const obs = (suffix: string, code: { code: string; display: string }, value: Json): Json => ({
      resourceType: 'Observation',
      id: `anc-${c.id}-${suffix}`,
      meta: { profile: [FHIR_PROFILE.observation] },
      status: 'final',
      code: { coding: [{ system: FHIR_SYS.loinc, ...code }], text: code.display },
      subject,
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: c.contactDate,
      ...value,
    });

    if (c.gestationDays != null) {
      out.push(
        obs('ga', OBSTETRIC_LOINC.gestationalAge, {
          valueQuantity: { value: Math.floor(c.gestationDays / 7), unit: 'weeks', system: FHIR_SYS.ucum, code: 'wk' },
        }),
      );
    }
    if (c.bpSystolic != null) {
      out.push(
        obs('bp-sys', OBSTETRIC_LOINC.systolic, {
          valueQuantity: { value: c.bpSystolic, unit: 'mm[Hg]', system: FHIR_SYS.ucum, code: 'mm[Hg]' },
        }),
      );
    }
    if (c.bpDiastolic != null) {
      out.push(
        obs('bp-dia', OBSTETRIC_LOINC.diastolic, {
          valueQuantity: { value: c.bpDiastolic, unit: 'mm[Hg]', system: FHIR_SYS.ucum, code: 'mm[Hg]' },
        }),
      );
    }
    if (c.weight != null) {
      out.push(
        obs('weight', OBSTETRIC_LOINC.bodyWeight, {
          valueQuantity: { value: Number(c.weight), unit: 'kg', system: FHIR_SYS.ucum, code: 'kg' },
        }),
      );
    }
    if (c.fundalHeight != null) {
      out.push(
        obs('sfh', OBSTETRIC_LOINC.fundalHeight, {
          valueQuantity: { value: c.fundalHeight, unit: 'cm', system: FHIR_SYS.ucum, code: 'cm' },
        }),
      );
    }
    if (c.hb != null) {
      out.push(
        obs('hb', OBSTETRIC_LOINC.haemoglobin, {
          valueQuantity: { value: Number(c.hb), unit: 'g/dL', system: FHIR_SYS.ucum, code: 'g/dL' },
        }),
      );
    }
    return out;
  }

  /** A postnatal contact → an Encounter, with the mother's and baby's findings. */
  buildPncContact(c: PncContact): Json[] {
    const subject = { reference: `Patient/${c.patientId}` };
    const encounterId = `pnc-${c.id}`;
    const out: Json[] = [
      {
        resourceType: 'Encounter',
        id: encounterId,
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
        type: [{ text: `Postnatal contact — ${PNC_WINDOW_LABEL[c.window] ?? c.window}` }],
        subject,
        episodeOfCare: [{ reference: `EpisodeOfCare/preg-episode-${c.pregnancyId}` }],
        period: { start: c.contactDate, end: c.contactDate },
        participant: c.recordedByName ? [{ individual: { display: c.recordedByName } }] : undefined,
        reasonCode: [{ text: 'Postnatal care' }],
      },
    ];

    const obs = (suffix: string, code: { code: string; display: string }, value: Json, who = subject): Json => ({
      resourceType: 'Observation',
      id: `pnc-${c.id}-${suffix}`,
      meta: { profile: [FHIR_PROFILE.observation] },
      status: 'final',
      code: { coding: [{ system: FHIR_SYS.loinc, ...code }], text: code.display },
      subject: who,
      encounter: { reference: `Encounter/${encounterId}` },
      effectiveDateTime: c.contactDate,
      ...value,
    });

    if (c.bpSystolic != null) {
      out.push(
        obs('bp-sys', OBSTETRIC_LOINC.systolic, {
          valueQuantity: { value: c.bpSystolic, unit: 'mm[Hg]', system: FHIR_SYS.ucum, code: 'mm[Hg]' },
        }),
      );
    }
    if (c.bpDiastolic != null) {
      out.push(
        obs('bp-dia', OBSTETRIC_LOINC.diastolic, {
          valueQuantity: { value: c.bpDiastolic, unit: 'mm[Hg]', system: FHIR_SYS.ucum, code: 'mm[Hg]' },
        }),
      );
    }
    if (c.hb != null) {
      out.push(
        obs('hb', OBSTETRIC_LOINC.haemoglobin, {
          valueQuantity: { value: Number(c.hb), unit: 'g/dL', system: FHIR_SYS.ucum, code: 'g/dL' },
        }),
      );
    }
    if (c.feedingMethod) {
      out.push(obs('feeding', OBSTETRIC_LOINC.breastfeeding, { valueCodeableConcept: { text: c.feedingMethod } }));
    }
    // The baby's weight belongs to the baby, and is only exportable once the
    // newborn has a patient record of their own to hang it on.
    if (c.babyWeight != null && c.babyPatientId) {
      out.push(
        obs(
          'baby-weight',
          OBSTETRIC_LOINC.bodyWeight,
          { valueQuantity: { value: Number(c.babyWeight), unit: 'kg', system: FHIR_SYS.ucum, code: 'kg' } },
          { reference: `Patient/${c.babyPatientId}` },
        ),
      );
    }
    return out;
  }

  /**
   * A pregnancy → FHIR EpisodeOfCare.
   *
   * The Shared Health Record requires every Encounter to reference the visit's
   * EpisodeOfCare, and a pregnancy is exactly that: the thread that the
   * antenatal contacts, the delivery and the postnatal contacts all belong to.
   * Without it each contact would arrive at the national record unrelated to
   * the others.
   */
  /**
   * A visit as a FHIR EpisodeOfCare.
   *
   * The Shared Health Record opens a visit against a verified consent and hands
   * back its own `visit_id`; where we have been given one it travels as an
   * identifier, so the national record and this one are talking about the same
   * visit rather than two that merely coincide.
   */
  buildVisitEpisode(visit: PatientVisit, hieVisitId?: string | null): Json {
    const start = (visit as unknown as { checkedInAt?: Date }).checkedInAt ?? visit.createdAt;
    return {
      resourceType: 'EpisodeOfCare',
      id: visitEpisodeId(visit.id),
      identifier: [
        { system: FHIR_SYS.visit, value: visit.id },
        ...(hieVisitId ? [{ system: FHIR_SYS.hieVisit, value: hieVisitId }] : []),
      ],
      status:
        visit.status === VisitStatus.COMPLETED
          ? 'finished'
          : visit.status === VisitStatus.CANCELLED
            ? 'cancelled'
            : 'active',
      type: visit.visitType
        ? [
            {
              coding: [
                { system: FHIR_SYS.visitType, code: visit.visitType, display: visit.visitType.replace(/_/g, ' ') },
              ],
              text: visit.visitType.replace(/_/g, ' '),
            },
          ]
        : undefined,
      patient: { reference: `Patient/${visit.patientId}` },
      managingOrganization: visit.facilityId
        ? { reference: `Organization/org-${visit.facilityId}` }
        : undefined,
      period: { start: start ? new Date(start).toISOString() : undefined },
    };
  }

  /**
   * One visit's clinical record, shaped the way the Shared Health Record takes
   * it: a collection Bundle whose Encounter references the visit's
   * EpisodeOfCare, and in which every clinical resource references that
   * Encounter.
   *
   * This is deliberately per visit rather than per patient. The SHR's rules
   * only make sense against a single encounter, and submitting a patient's
   * whole history as one undifferentiated pile — which is what this system did
   * before — produces resources that reference nothing.
   */
  async visitShrBundle(
    visitId: string,
    facilityId: string,
    opts: { hieVisitId?: string | null } = {},
  ): Promise<{ bundle: Json; validation: ReturnType<typeof validateShrBundle> }> {
    const visit = await this.visits.findOne({ where: { id: visitId, facilityId } });
    if (!visit) throw new NotFoundException('Visit not found');
    const patient = await this.patients.findOne({ where: { id: visit.patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilities.findOne({ where: { id: facilityId } });

    // Notes carry no visit id, so the day's note is the visit's note — the same
    // rule the reports and claims paths already use.
    const dayKey = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const vDay = dayKey((visit as unknown as { checkedInAt?: Date }).checkedInAt ?? visit.createdAt);
    const allNotes = await this.notes.find({ where: { patientId: visit.patientId, facilityId } });
    const notes = allNotes.filter((n) => dayKey(n.createdAt) === vDay);

    const [prescriptions, labOrders, studies] = await Promise.all([
      this.prescriptions.find({ where: { visitId, facilityId } }),
      this.labOrders.find({ where: { visitId, facilityId } }),
      this.studies.find({ where: { visitId } }),
    ]);

    const context: Json[] = [this.buildPatient(patient), this.buildVisitEpisode(visit, opts.hieVisitId)];
    if (facility) context.push(this.buildOrganization(facility));

    const authorIds = [...new Set(notes.map((n) => n.createdById).filter(Boolean))] as string[];
    if (authorIds.length) {
      const staff = await this.users.find({ where: { id: In(authorIds) } });
      for (const u of staff) context.push(this.buildPractitioner(u));
    }

    // One Encounter for the visit. Where the visit was documented, it is built
    // from the note; where it was not, the visit itself still happened and is
    // reported rather than dropped.
    const encounter = notes.length
      ? this.buildEncounter(notes[0], visit)
      : {
          resourceType: 'Encounter',
          id: `enc-visit-${visit.id}`,
          status: 'finished',
          class: this.encounterClass(visit.visitType),
          subject: { reference: `Patient/${patient.id}` },
          episodeOfCare: [{ reference: `EpisodeOfCare/${visitEpisodeId(visit.id)}` }],
          period: {
            start: dayKey(visit.createdAt) ? new Date(visit.createdAt).toISOString() : undefined,
          },
          serviceProvider: facility ? { reference: `Organization/org-${facility.id}` } : undefined,
        };
    const encounterId = String(encounter.id);

    const clinical: Json[] = [];
    for (const note of notes) clinical.push(...this.buildConditions(note));

    if (prescriptions.length) {
      const itemIds = [...new Set(prescriptions.flatMap((rx) => (rx.items ?? []).map((i) => i.itemId)))].filter(
        Boolean,
      ) as string[];
      const items = itemIds.length ? await this.items.find({ where: { id: In(itemIds) } }) : [];
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const rx of prescriptions) clinical.push(...this.buildMedicationRequests(rx, byId));
    }

    for (const study of studies) {
      if (study.status === RadiologyStatus.COMPLETED) clinical.push(this.buildImagingReport(study));
    }

    if (labOrders.length) {
      // Order items and their results come back with the order; the LOINC
      // mappings are looked up the same way the patient bundle does.
      const testIds = [
        ...new Set(labOrders.flatMap((o) => (o.items ?? []).map((i) => i.labTestId).filter(Boolean))),
      ] as string[];
      const analyteIds = [
        ...new Set(
          labOrders.flatMap((o) =>
            (o.items ?? []).flatMap((i) =>
              (i.results ?? []).map((r) => r.analyteId).filter((x): x is string => !!x),
            ),
          ),
        ),
      ];
      const [tests, analytes] = await Promise.all([
        testIds.length ? this.labTests.find({ where: { id: In(testIds) } }) : Promise.resolve([]),
        analyteIds.length ? this.labAnalytes.find({ where: { id: In(analyteIds) } }) : Promise.resolve([]),
      ]);
      const byTest = new Map(tests.map((t) => [t.id, t]));
      const byAnalyte = new Map(analytes.map((a) => [a.id, a]));
      for (const order of labOrders) {
        for (const item of order.items ?? []) {
          clinical.push(...this.buildObservations(order, item, byTest, byAnalyte));
        }
      }
    }

    const bundle = collectionBundle([...context, encounter, ...stampEncounter(clinical, encounterId)]);
    // Checked here rather than trusted: a submission that breaks the SHR's own
    // rules should be caught before it is sent, not after it is rejected.
    return { bundle, validation: validateShrBundle(bundle) };
  }

  buildPregnancyEpisode(p: Pregnancy): Json {
    const dated = resolveDating(p);
    return {
      resourceType: 'EpisodeOfCare',
      id: `preg-episode-${p.id}`,
      identifier: p.ancNumber
        ? [{ system: FHIR_SYS.ancNumber, value: p.ancNumber }]
        : undefined,
      status: p.status === 'active' ? 'active' : 'finished',
      type: [{ coding: [{ system: FHIR_SYS.loinc, ...OBSTETRIC_LOINC.pregnancyStatus }], text: 'Pregnancy' }],
      patient: { reference: `Patient/${p.patientId}` },
      period: {
        start: p.lmp ?? (dated ? lmpFromEdd(dated.edd) : undefined) ?? undefined,
        end: p.outcomeDate ?? undefined,
      },
    };
  }

  /**
   * A labour and delivery → an Encounter inside the pregnancy's episode, with
   * the observations MOH 333 records against the mother.
   */
  buildDelivery(d: Delivery): Json[] {
    const subject = { reference: `Patient/${d.patientId}` };
    const encounterId = `delivery-${d.id}`;
    const start = d.admittedAt ?? d.labourOnsetAt ?? d.deliveredAt;

    const out: Json[] = [
      {
        resourceType: 'Encounter',
        id: encounterId,
        status: d.deliveredAt ? 'finished' : 'in-progress',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'IMP',
          display: 'inpatient encounter',
        },
        type: [
          {
            text: d.deliveryMode
              ? (DELIVERY_MODE_LABEL[d.deliveryMode] ?? 'Delivery')
              : 'Labour and delivery',
          },
        ],
        subject,
        // The tie the SHR asks for: this encounter belongs to the pregnancy.
        episodeOfCare: [{ reference: `EpisodeOfCare/preg-episode-${d.pregnancyId}` }],
        period: {
          start: start ? new Date(start).toISOString() : undefined,
          end: d.maternalDischargedAt
            ? new Date(d.maternalDischargedAt).toISOString()
            : d.deliveredAt
              ? new Date(d.deliveredAt).toISOString()
              : undefined,
        },
        participant: d.conductedByName ? [{ individual: { display: d.conductedByName } }] : undefined,
        hospitalization: d.referredIn
          ? { admitSource: { text: `Referred in${d.referredFrom ? ` from ${d.referredFrom}` : ''}` } }
          : undefined,
        reasonCode: [{ text: 'Labour and delivery' }],
      },
    ];

    if (d.gestationWeeks != null && d.deliveredAt) {
      out.push({
        resourceType: 'Observation',
        id: `delivery-${d.id}-ga`,
        meta: { profile: [FHIR_PROFILE.observation] },
        status: 'final',
        code: {
          coding: [{ system: FHIR_SYS.loinc, ...OBSTETRIC_LOINC.gestationalAge }],
          text: OBSTETRIC_LOINC.gestationalAge.display,
        },
        subject,
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime: new Date(d.deliveredAt).toISOString(),
        valueQuantity: {
          value: d.gestationWeeks,
          unit: 'weeks',
          system: FHIR_SYS.ucum,
          code: 'wk',
        },
      });
    }

    return out;
  }

  /**
   * A baby → the observations recorded at birth.
   *
   * Birth weight and the Apgar scores belong to the baby, so they are written
   * against the newborn's own patient record where one exists and against the
   * mother's encounter otherwise — the facts are real either way, and dropping
   * them because the baby has not been registered yet would lose them.
   */
  buildBirth(b: Birth): Json[] {
    const subject = b.babyPatientId
      ? { reference: `Patient/${b.babyPatientId}` }
      : { reference: `Patient/${b.motherPatientId}` };
    const when = b.bornAt ? new Date(b.bornAt).toISOString() : undefined;
    const encounter = { reference: `Encounter/delivery-${b.deliveryId}` };

    const obs = (suffix: string, code: { code: string; display: string }, value: Json): Json => ({
      resourceType: 'Observation',
      id: `birth-${b.id}-${suffix}`,
      meta: { profile: [FHIR_PROFILE.observation] },
      status: 'final',
      code: { coding: [{ system: FHIR_SYS.loinc, ...code }], text: code.display },
      subject,
      encounter,
      effectiveDateTime: when,
      // Whose observation this is, where the baby has no record of their own.
      focus: b.babyPatientId ? undefined : [{ display: `Baby ${b.birthOrder}` }],
      ...value,
    });

    const out: Json[] = [
      obs(
        'outcome',
        b.outcome === 'live-birth' ? OBSTETRIC_LOINC.liveBirths : OBSTETRIC_LOINC.stillbirths,
        { valueCodeableConcept: { text: BIRTH_OUTCOME_LABEL[b.outcome] ?? b.outcome } },
      ),
    ];

    if (b.birthWeightGrams != null) {
      out.push(
        obs('weight', OBSTETRIC_LOINC.birthWeight, {
          valueQuantity: { value: b.birthWeightGrams, unit: 'g', system: FHIR_SYS.ucum, code: 'g' },
        }),
      );
    }
    for (const [suffix, score, code] of [
      ['apgar1', b.apgar1, OBSTETRIC_LOINC.apgar1],
      ['apgar5', b.apgar5, OBSTETRIC_LOINC.apgar5],
      ['apgar10', b.apgar10, OBSTETRIC_LOINC.apgar10],
    ] as const) {
      if (score != null) {
        out.push(obs(suffix, code, { valueQuantity: { value: score, unit: '{score}' } }));
      }
    }
    return out;
  }

  // ── Clinical summary (IPS-style document) ────────────────────────────────────

  /**
   * A clinical summary for a patient: human-readable and exchangeable, which is
   * what the certification criterion asks for.
   *
   * Built as an IPS-style document — a Composition whose sections each carry
   * narrative XHTML as well as references to the resources they summarise — in
   * a Bundle of type `document`. The narrative matters: it is what a clinician
   * reads when the receiving system cannot process the structured entries.
   */
  async clinicalSummary(patientId: string, facilityId: string): Promise<Json> {
    // Everything the summary reports on, gathered once.
    const collection = (await this.patientBundle(patientId, facilityId, 'collection')) as {
      entry: { resource: Json }[];
    };
    const resources = (collection.entry ?? []).map((e) => e.resource);
    const of = (type: string) => resources.filter((r) => r.resourceType === type);

    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const problems = await this.problems.find({ where: { facilityId, patientId } });
    const familyHistory = await this.familyHistory.find({ where: { facilityId, patientId } });
    const immunisations = await this.immunisations.find({ where: { facilityId, patientId } });
    const pregnancies = await this.pregnancies.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
    });
    const [pncVisits, babies] = pregnancies.length
      ? await Promise.all([
          this.pncContacts.find({ where: { facilityId, pregnancyId: In(pregnancies.map((x) => x.id)) } }),
          this.birthRecords.find({ where: { facilityId, pregnancyId: In(pregnancies.map((x) => x.id)) } }),
        ])
      : [[] as PncContact[], [] as Birth[]];
    const allergies = await this.allergies.find({ where: { facilityId, patientId } });
    const medications = await this.meds.medications(facilityId, patientId);
    const appointments = await this.appointments.find({
      where: { facilityId, patientId },
      order: { appointmentDate: 'DESC' },
    });

    const ref = (r: Json) => ({ reference: `${r.resourceType}/${r.id}` });
    const now = new Date().toISOString();
    const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : '');

    // Each section: its code, its narrative, and what it points at.
    const sections: Json[] = [];

    sections.push({
      title: 'Problems',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.problems }] },
      text: {
        status: 'generated',
        div: narrative(
          problems.map((p) => [p.display, p.code ?? '—', p.status, dateOnly(p.onsetDate) || '—']),
          ['Problem', 'ICD-11', 'Status', 'Onset'],
          'No problems recorded.',
        ),
      },
      entry: of('Condition').map(ref),
    });

    sections.push({
      title: 'Allergies and intolerances',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.allergies }] },
      text: {
        status: 'generated',
        div: narrative(
          allergies.map((a) => [
            a.allergenName,
            a.allergenType,
            (a.manifestations ?? []).map((m) => m.display).join(', ') || '—',
            a.severity ?? '—',
            a.status,
          ]),
          ['Allergen', 'Type', 'Reaction', 'Severity', 'Status'],
          // "None recorded" is not the same as "no allergies" — say which.
          'No allergies recorded. This is not the same as a confirmed absence of allergies.',
        ),
      },
      entry: of('AllergyIntolerance').map(ref),
    });

    sections.push({
      title: 'Medications',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.medications }] },
      text: {
        status: 'generated',
        div: narrative(
          medications.map((m) => [
            m.medication,
            [m.dosage, m.frequency].filter(Boolean).join(' ') || '—',
            m.duration ?? '—',
            m.activeBasis === 'ended' ? 'Ended' : m.activeBasis === 'duration-not-recorded' ? 'Duration not recorded' : 'Current',
            dateOnly(m.prescribedOn) || '—',
          ]),
          ['Medication', 'Dose', 'Duration', 'Status', 'Prescribed'],
          'No medications recorded.',
        ),
      },
      entry: [...of('MedicationStatement'), ...of('MedicationRequest')].map(ref),
    });

    const results = [...of('Observation'), ...of('DiagnosticReport')];
    sections.push({
      title: 'Results',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.results }] },
      text: {
        status: 'generated',
        div: narrative(
          of('DiagnosticReport').map((r) => [
            ((r.code as Json)?.text as string) ?? '—',
            (r.status as string) ?? '—',
            dateOnly(r.effectiveDateTime),
          ]),
          ['Report', 'Status', 'Date'],
          'No results recorded.',
        ),
      },
      entry: results.map(ref),
    });

    sections.push({
      title: 'Encounters',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.encounters }] },
      text: {
        status: 'generated',
        div: narrative(
          of('Encounter').map((e) => [
            ((e.type as Json[])?.[0]?.text as string) ?? ((e.class as Json)?.code as string) ?? 'Encounter',
            dateOnly((e.period as Json)?.start),
          ]),
          ['Encounter', 'Date'],
          'No encounters recorded.',
        ),
      },
      entry: of('Encounter').map(ref),
    });

    const procedures = of('Procedure');
    if (procedures.length) {
      sections.push({
        title: 'Procedures',
        code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.procedures }] },
        text: {
          status: 'generated',
          div: narrative(
            procedures.map((p) => [((p.code as Json)?.text as string) ?? '—', dateOnly(p.performedDateTime)]),
            ['Procedure', 'Date'],
            'No procedures recorded.',
          ),
        },
        entry: procedures.map(ref),
      });
    }

    // Scheduled care — the criterion's "care plan is scheduled care for a
    // specific clinical outcome". Built from real appointments, not invented.
    const upcoming = appointments.filter((a) => a.status !== 'cancelled');
    sections.push({
      title: 'Plan of care',
      code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.carePlan }] },
      text: {
        status: 'generated',
        div: narrative(
          upcoming.map((a) => [
            a.customReason || a.reason || 'Follow-up',
            `${dateOnly(a.appointmentDate)} ${a.appointmentTime ?? ''}`.trim(),
            a.status,
          ]),
          ['Planned care', 'When', 'Status'],
          'No scheduled care recorded.',
        ),
      },
    });

    // Family history sits with the clinical sections — it is background a
    // receiving clinician reads, not an event in the record.
    const relatives = await this.familyHistory.find({ where: { facilityId, patientId } });
    const shownRelatives = relatives.filter((r) => r.status !== 'entered-in-error');
    if (shownRelatives.length) {
      sections.push({
        title: 'Family history',
        code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.familyHistory }] },
        text: {
          status: 'generated',
          div: narrative(
            shownRelatives.map((r) => [
              relationshipOf(r.relationship)?.label ?? r.relationship,
              r.status === 'health-unknown'
                ? 'Not known'
                : (r.conditions ?? []).map((c) => c.display).join(', ') || 'No conditions reported',
              r.deceased ? `Deceased${r.ageAtDeath ? ` at ${r.ageAtDeath}` : ''}` : 'Living',
            ]),
            ['Relative', 'Conditions', 'Status'],
            'No family history recorded.',
          ),
        },
        entry: of('FamilyMemberHistory').map(ref),
      });
    }

    if (immunisations.length) {
      sections.push({
        title: 'Immunisations',
        code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.immunisations }] },
        text: {
          status: 'generated',
          div: narrative(
            immunisations.map((i) => [
              vaccineLabel(i.vaccine),
              `Dose ${i.dose}`,
              i.givenDate,
              // Whether this facility gave it matters on a referral.
              i.givenHere ? 'Given here' : 'Reported (card)',
            ]),
            ['Vaccine', 'Dose', 'Date', 'Source'],
            'No immunisations recorded.',
          ),
        },
        entry: of('Immunization').map(ref),
      });
    }

    if (pregnancies.length) {
      const today = new Date().toISOString().slice(0, 10);
      sections.push({
        title: 'Pregnancy',
        code: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.pregnancy }] },
        text: {
          status: 'generated',
          div: narrative(
            pregnancies.map((p) => {
              const dated = resolveDating(p);
              const g = gestationOn(p, p.status === 'active' ? today : (p.outcomeDate ?? today));
              const pnc = pncVisits.filter((v) => v.pregnancyId === p.id).length;
              return [
                p.ancNumber ?? '—',
                p.status === 'active' ? 'Ongoing' : `Ended ${p.outcomeDate ?? ''} — ${p.outcome ?? 'not recorded'}`,
                dated ? `EDD ${dated.edd} (${dated.basis})` : 'Not dated',
                g ? `${g.weeks}w ${g.days}d` : '—',
                [p.gravida != null ? `G${p.gravida}` : '', p.para != null ? `P${p.para}` : '']
                  .filter(Boolean)
                  .join(' ') || '—',
                // Postnatal contacts belong on the summary: a referral needs to
                // know whether the puerperium was followed up at all.
                p.status === 'ended' ? `${pnc} postnatal contact${pnc === 1 ? '' : 's'}` : '—',
                // Every baby, with its weight and one-minute score — the figures
                // a receiving unit asks for first.
                babies
                  .filter((b) => b.pregnancyId === p.id)
                  .map((b) =>
                    [
                      BIRTH_OUTCOME_LABEL[b.outcome] ?? b.outcome,
                      b.sex,
                      b.birthWeightGrams ? `${b.birthWeightGrams} g` : null,
                      b.apgar1 != null ? `Apgar ${b.apgar1}` : null,
                    ]
                      .filter(Boolean)
                      .join(', '),
                  )
                  .join(' · ') || '—',
              ];
            }),
            ['ANC no.', 'Status', 'Dating', 'Gestation', 'Obstetric history', 'Postnatal', 'Babies'],
            'No pregnancy recorded.',
          ),
        },
        entry: of('Observation')
          .filter((r) => String(r.id ?? '').startsWith('preg-'))
          .map(ref),
      });
    }

    const practitioners = of('Practitioner');
    const organization = of('Organization')[0];

    const composition: Json = {
      resourceType: 'Composition',
      id: `summary-${patientId}`,
      status: 'final',
      type: { coding: [{ system: FHIR_SYS.loinc, ...SUMMARY_LOINC.document }], text: 'Clinical summary' },
      subject: { reference: `Patient/${patientId}` },
      date: now,
      // Who produced it, and which facility stands behind it.
      author: [
        ...(organization ? [ref(organization)] : []),
        ...practitioners.slice(0, 1).map(ref),
      ],
      title: `Clinical summary — ${[patient.firstName, patient.lastName].filter(Boolean).join(' ')}`,
      custodian: organization ? ref(organization) : undefined,
      section: sections,
    };

    return {
      resourceType: 'Bundle',
      type: 'document',
      timestamp: now,
      identifier: { system: FHIR_SYS.mrn, value: `summary-${patientId}-${now.slice(0, 10)}` },
      // A document Bundle leads with its Composition; everything it references follows.
      entry: [composition, ...resources].map((r) => ({
        fullUrl: `urn:uuid:${r.id}`,
        resource: r,
      })),
      meta: facility ? { source: facility.name ?? undefined } : undefined,
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
