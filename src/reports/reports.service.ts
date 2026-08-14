import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Billing, BillingStatus, PaymentMode } from '../billing/entities/billing.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';

/** One disease line on an MOH 705A/705B outpatient morbidity summary. */
export interface MorbidityRow {
  diagnosis: string;
  icd10: string | null;
  total: number;
  male: number;
  female: number;
  new: number;
  revisit: number;
}

/** One line on an MOH 204A/204B outpatient register. */
export interface OutpatientRegisterRow {
  visitId: string;
  date: string | null;
  patientNo: string | null;
  name: string;
  ageYears: number | null;
  ageMonths: number | null;
  sex: string | null;
  residence: string | null;
  attendance: 'new' | 'revisit';
  visitType: string | null;
  diagnosis: string | null;
  icd10: string | null;
  treatment: string | null;
  referredIn: boolean;
  fee: number;
}

/** One bill behind a payer-mix figure — the drill-down unit. */
export interface PayerMixDrillBill {
  id: string;
  payer: string;
  type: 'cash' | 'insurer';
  patientName: string;
  patientNo: string | null;
  serviceType: string;
  serviceDescription: string | null;
  createdAt: string | null;
  paymentMethod: string | null;
  amount: number;
  amountPaid: number;
  owed: number;
  status: string;
  visitId: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
    @InjectRepository(SoapNote)
    private readonly soapRepo: Repository<SoapNote>,
  ) {}

  // ── PATIENTS TODAY ─────────────────────────────────────────────────────────
  async getPatientsToday(facilityId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const visits = await this.visitsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.patient', 'patient')
      .leftJoinAndSelect('v.assignedDoctor', 'doctor')
      .leftJoinAndSelect('v.checkedInBy', 'checkedInBy')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.created_at >= :today', { today })
      .andWhere('v.created_at < :tomorrow', { tomorrow })
      .orderBy('v.created_at', 'ASC')
      .getMany();

    const total = visits.length;
    const byStatus = {
      checked_in: visits.filter(v => v.status === VisitStatus.CHECKED_IN).length,
      triage: visits.filter(v => v.status === VisitStatus.TRIAGE).length,
      waiting_for_doctor: visits.filter(v => v.status === VisitStatus.WAITING_FOR_DOCTOR).length,
      with_doctor: visits.filter(v => v.status === VisitStatus.WITH_DOCTOR).length,
      completed: visits.filter(v => v.status === VisitStatus.COMPLETED).length,
      cancelled: visits.filter(v => v.status === VisitStatus.CANCELLED).length,
    };

    return { total, byStatus, visits };
  }

  // ── FINANCIAL REPORT ───────────────────────────────────────────────────────
  async getFinancialReport(
    facilityId: string,
    from: Date,
    to: Date,
  ) {
    const toEndOfDay = new Date(to);
    toEndOfDay.setHours(23, 59, 59, 999);

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .leftJoinAndSelect('b.collectedBy', 'collectedBy')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEndOfDay })
      .orderBy('b.created_at', 'DESC')
      .getMany();

    const totalBilled = bills.reduce((s, b) => s + Number(b.amount), 0);
    const totalCollected = bills
      .filter(b => b.status === BillingStatus.PAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalWaived = bills
      .filter(b => b.status === BillingStatus.WAIVED)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalOutstanding = bills
      .filter(b => b.status === BillingStatus.UNPAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalInsurancePending = bills
      .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
      .reduce((s, b) => s + Number(b.amount), 0);

    // Breakdown by service type
    const serviceTypes = [...new Set(bills.map(b => b.serviceType))];
    const byServiceType = serviceTypes.map(type => {
      const typeBills = bills.filter(b => b.serviceType === type);
      return {
        type,
        count: typeBills.length,
        total: typeBills.reduce((s, b) => s + Number(b.amount), 0),
        collected: typeBills
          .filter(b => b.status === BillingStatus.PAID)
          .reduce((s, b) => s + Number(b.amount), 0),
      };
    });

    // Breakdown by payment method
    const byPaymentMethod = ['cash', 'mpesa', 'card'].map(method => ({
      method,
      count: bills.filter(b => b.paymentMethod === method).length,
      total: bills
        .filter(b => b.paymentMethod === method)
        .reduce((s, b) => s + Number(b.amount), 0),
    }));

    return {
      period: { from, to: toEndOfDay },
      summary: {
        totalBilled,
        totalCollected,
        totalWaived,
        totalOutstanding,
        totalInsurancePending,
        transactionCount: bills.length,
      },
      byServiceType,
      byPaymentMethod,
      bills,
    };
  }

  /**
   * Payer-mix analysis. Splits the period's billed revenue across payer
   * categories — self-pay (cash) versus each insurer — with what was billed,
   * collected, still outstanding, and each payer's share of the total. Hospital
   * management uses this to see how dependent the facility is on each insurer.
   */
  async payerMix(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .leftJoinAndSelect('visit.patient', 'visitPatient')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEnd })
      .andWhere('b.status != :waived', { waived: BillingStatus.WAIVED })
      .getMany();

    const map = new Map<
      string,
      { payer: string; type: 'cash' | 'insurer'; billed: number; collected: number; outstanding: number; count: number }
    >();
    // Cash collections split by tender (cash / mpesa / card).
    const tender = new Map<string, number>();
    // The individual bills behind each figure — powers the drill-down.
    const drill: PayerMixDrillBill[] = [];

    for (const b of bills) {
      const isInsurer = b.paymentMode === PaymentMode.INSURANCE || b.paymentMode === PaymentMode.SPLIT;
      const payer = isInsurer ? b.insurerName || b.insuranceSchemeName || 'Insurer (unspecified)' : 'Cash / self-pay';
      const key = `${isInsurer ? 'I' : 'C'}:${payer}`;
      const amount = Number(b.amount);
      const paid = Number(b.amountPaid || 0);

      const g = map.get(key) ?? {
        payer, type: isInsurer ? 'insurer' as const : 'cash' as const,
        billed: 0, collected: 0, outstanding: 0, count: 0,
      };
      g.billed = r2(g.billed + amount);
      g.collected = r2(g.collected + paid);
      g.outstanding = r2(g.outstanding + Math.max(0, amount - paid));
      g.count += 1;
      map.set(key, g);

      if (!isInsurer && paid > 0) {
        const t = (b.paymentMethod as string) || 'cash';
        tender.set(t, r2((tender.get(t) || 0) + paid));
      }

      const person = b.patient ?? b.visit?.patient;
      drill.push({
        id: b.id,
        payer,
        type: isInsurer ? 'insurer' : 'cash',
        patientName: person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
        patientNo: person?.patientId ?? null,
        serviceType: b.serviceType,
        serviceDescription: b.serviceDescription ?? null,
        createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
        paymentMethod: (b.paymentMethod as string) ?? null,
        amount: r2(amount),
        amountPaid: r2(paid),
        owed: r2(Math.max(0, amount - paid)),
        status: b.status,
        visitId: b.visitId ?? null,
      });
    }

    const totalBilled = r2([...map.values()].reduce((s, g) => s + g.billed, 0));
    const rows = [...map.values()]
      .map((g) => ({ ...g, share: totalBilled ? r2((g.billed / totalBilled) * 100) : 0 }))
      .sort((a, b) => b.billed - a.billed);

    return {
      period: { from, to: toEnd },
      rows,
      tenderBreakdown: [...tender.entries()].map(([method, amount]) => ({ method, amount })),
      totals: {
        billed: totalBilled,
        collected: r2([...map.values()].reduce((s, g) => s + g.collected, 0)),
        outstanding: r2([...map.values()].reduce((s, g) => s + g.outstanding, 0)),
      },
      bills: drill,
    };
  }

  // ── MOH 204A / 204B OUTPATIENT REGISTER ────────────────────────────────────
  // The statutory outpatient register: one line per visit, split into under-5
  // (204A) and 5-and-over (204B). Diagnosis/treatment come from the visit's
  // SOAP note (matched by patient + same day); the fee from its bills.
  async outpatientRegister(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const visits = await this.visitsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.patient', 'patient')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.created_at >= :from', { from })
      .andWhere('v.created_at <= :to', { to: toEnd })
      .andWhere('v.status != :cancelled', { cancelled: VisitStatus.CANCELLED })
      .orderBy('v.created_at', 'ASC')
      .getMany();

    const visitIds = visits.map((v) => v.id);
    const patientIds = [...new Set(visits.map((v) => v.patientId))];

    const bills = visitIds.length
      ? await this.billingRepo.find({ where: { visitId: In(visitIds) } })
      : [];
    const feeByVisit = new Map<string, number>();
    for (const b of bills)
      feeByVisit.set(b.visitId, r2((feeByVisit.get(b.visitId) || 0) + Number(b.amount)));

    const dayKey = (d: Date | string | null | undefined) =>
      d ? new Date(d).toISOString().slice(0, 10) : '';
    const notes = patientIds.length
      ? await this.soapRepo.find({ where: { patientId: In(patientIds) }, order: { createdAt: 'ASC' } })
      : [];
    // Latest note per patient-day wins (most complete by the end of the visit).
    const noteByPatientDay = new Map<string, SoapNote>();
    for (const n of notes) noteByPatientDay.set(`${n.patientId}:${dayKey(n.createdAt)}`, n);

    const REVISIT = new Set(['follow_up', 'appointment']);
    const rows: OutpatientRegisterRow[] = visits.map((v) => {
      const p = v.patient;
      const when = v.checkedInAt ?? v.createdAt;
      const age = this.ageAt(p?.dateOfBirth, when, p?.age);
      const note = noteByPatientDay.get(`${v.patientId}:${dayKey(when)}`);
      const icd10 = note?.icd10Code
        ? `${note.icd10Code}${note.icd10Description ? ` ${note.icd10Description}` : ''}`
        : null;
      return {
        visitId: v.id,
        date: when ? new Date(when).toISOString().slice(0, 10) : null,
        patientNo: p?.patientId ?? null,
        name: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
        ageYears: age.years,
        ageMonths: age.months,
        sex: p?.gender ?? null,
        residence: [p?.subCounty, p?.county].filter(Boolean).join(', ') || null,
        attendance: v.visitType && REVISIT.has(v.visitType) ? 'revisit' : 'new',
        visitType: v.visitType ?? null,
        diagnosis: note?.diagnosis?.trim() || null,
        icd10,
        treatment: note?.management?.trim() || null,
        referredIn: v.visitType === 'referral',
        fee: feeByVisit.get(v.id) ?? 0,
      };
    });

    const under5 = rows.filter((r) => r.ageYears !== null && r.ageYears < 5);
    const over5 = rows.filter((r) => r.ageYears === null || r.ageYears >= 5);
    const tally = (list: OutpatientRegisterRow[]) => ({
      total: list.length,
      new: list.filter((r) => r.attendance === 'new').length,
      revisit: list.filter((r) => r.attendance === 'revisit').length,
      male: list.filter((r) => (r.sex ?? '').toLowerCase().startsWith('m')).length,
      female: list.filter((r) => (r.sex ?? '').toLowerCase().startsWith('f')).length,
      referredIn: list.filter((r) => r.referredIn).length,
      fees: r2(list.reduce((s, r) => s + r.fee, 0)),
    });

    return {
      period: { from, to: toEnd },
      under5,
      over5,
      totals: { under5: tally(under5), over5: tally(over5) },
    };
  }

  // ── MOH 705A / 705B OUTPATIENT MORBIDITY SUMMARY ───────────────────────────
  // Compiled from the 204 register: the period's diagnoses ranked by frequency,
  // split under-5 (705A) / over-5 (705B), each with sex and new/revisit counts.
  // Grouped by ICD-10 code where recorded, otherwise by the diagnosis text.
  async outpatientMorbidity(facilityId: string, from: Date, to: Date) {
    const reg = await this.outpatientRegister(facilityId, from, to);

    const build = (rows: OutpatientRegisterRow[]): MorbidityRow[] => {
      const map = new Map<string, MorbidityRow>();
      for (const r of rows) {
        const code = r.icd10 ? r.icd10.split(' ')[0] : null;
        const label = r.diagnosis || r.icd10 || 'Not recorded';
        const key = (code || label).toLowerCase();
        const g =
          map.get(key) ??
          { diagnosis: r.diagnosis || r.icd10 || 'Not recorded', icd10: code, total: 0, male: 0, female: 0, new: 0, revisit: 0 };
        g.total += 1;
        const sex = (r.sex ?? '').toLowerCase();
        if (sex.startsWith('m')) g.male += 1;
        else if (sex.startsWith('f')) g.female += 1;
        if (r.attendance === 'new') g.new += 1;
        else g.revisit += 1;
        map.set(key, g);
      }
      return [...map.values()].sort((a, b) => b.total - a.total);
    };

    const under5 = build(reg.under5);
    const over5 = build(reg.over5);
    const sum = (list: MorbidityRow[]) => ({
      diagnoses: list.length,
      total: list.reduce((s, r) => s + r.total, 0),
      male: list.reduce((s, r) => s + r.male, 0),
      female: list.reduce((s, r) => s + r.female, 0),
      new: list.reduce((s, r) => s + r.new, 0),
      revisit: list.reduce((s, r) => s + r.revisit, 0),
    });

    return {
      period: reg.period,
      under5,
      over5,
      totals: { under5: sum(under5), over5: sum(over5) },
    };
  }

  /** Whole years (and residual months) at a reference date, from a DOB. */
  private ageAt(
    dob: string | null | undefined,
    at: Date | string | null | undefined,
    fallback?: number | null,
  ): { years: number | null; months: number | null } {
    if (!dob) return { years: fallback ?? null, months: null };
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return { years: fallback ?? null, months: null };
    const ref = at ? new Date(at) : new Date();
    let years = ref.getFullYear() - birth.getFullYear();
    let months = ref.getMonth() - birth.getMonth();
    if (ref.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years: Math.max(0, years), months: Math.max(0, months) };
  }

  // ── INSURANCE CLAIMS REPORT ────────────────────────────────────────────────
  async getInsuranceClaims(
    facilityId: string,
    from: Date,
    to: Date,
    insuranceSchemeName?: string,
  ) {
    const toEndOfDay = new Date(to);
    toEndOfDay.setHours(23, 59, 59, 999);

    const qb = this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.payment_mode IN (:...modes)', {
        modes: [PaymentMode.INSURANCE, PaymentMode.SPLIT],
      })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEndOfDay })
      .orderBy('b.created_at', 'DESC');

    if (insuranceSchemeName) {
      qb.andWhere('b.insurance_scheme_name = :scheme', {
        scheme: insuranceSchemeName,
      });
    }

    const claims = await qb.getMany();

    const totalClaimed = claims.reduce((s, b) => s + Number(b.amount), 0);
    const totalPending = claims
      .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalSettled = claims
      .filter(b => b.status === BillingStatus.PAID)
      .reduce((s, b) => s + Number(b.amount), 0);

    // Group by insurer
    const schemeNames = [...new Set(claims.map(b => b.insuranceSchemeName).filter(Boolean))];
    const byScheme = schemeNames.map(scheme => {
      const schemeBills = claims.filter(b => b.insuranceSchemeName === scheme);
      return {
        scheme,
        count: schemeBills.length,
        total: schemeBills.reduce((s, b) => s + Number(b.amount), 0),
        pending: schemeBills
          .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
          .reduce((s, b) => s + Number(b.amount), 0),
      };
    });

    return {
      period: { from, to: toEndOfDay },
      summary: { totalClaimed, totalPending, totalSettled, claimCount: claims.length },
      byScheme,
      claims,
    };
  }

  // ── CSV EXPORT ─────────────────────────────────────────────────────────────
  async getInsuranceClaimsCsv(
    facilityId: string,
    from: Date,
    to: Date,
    insuranceSchemeName?: string,
  ): Promise<string> {
    const report = await this.getInsuranceClaims(facilityId, from, to, insuranceSchemeName);

    const header = [
      'Date', 'Patient Name', 'Patient ID', 'Membership No',
      'Insurance Scheme', 'Service Type', 'Service Description',
      'Amount (KES)', 'Status', 'Payment Mode',
    ].join(',');

    const rows = report.claims.map(b => {
      const date = new Date(b.createdAt).toLocaleDateString('en-KE');
      const name = `${b.patient?.firstName ?? ''} ${b.patient?.lastName ?? ''}`.trim();
      const patientId = b.patient?.patientId ?? '';
      const membershipNo = b.patient?.membershipNo ?? '';
      const scheme = b.insuranceSchemeName ?? '';
      const serviceType = b.serviceType;
      const desc = (b.serviceDescription ?? '').replace(/,/g, ';');
      const amount = Number(b.amount).toFixed(2);
      const status = b.status;
      const mode = b.paymentMode;
      return [date, name, patientId, membershipNo, scheme, serviceType, desc, amount, status, mode].join(',');
    });

    return [header, ...rows].join('\n');
  }
}