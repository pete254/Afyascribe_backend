import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Billing, BillingStatus, PaymentMode } from '../billing/entities/billing.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { LabOrder } from '../lab/entities/lab-order.entity';
import { Admission } from '../inpatient/entities/admission.entity';
import { Bed } from '../inpatient/entities/bed.entity';
import { Ward } from '../inpatient/entities/ward.entity';
import { User } from '../users/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Supplier } from '../inventory/entities/supplier.entity';
import { SupplierInvoice } from '../inventory/entities/supplier-invoice.entity';
import { SupplierPayment } from '../inventory/entities/supplier-payment.entity';
import { Employee } from '../payroll/entities/employee.entity';
import { PayrollRun } from '../payroll/entities/payroll-run.entity';
import { Payslip } from '../payroll/entities/payslip.entity';

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

/** One supplier's aged-payables row. */
export interface SupplierPayableRow {
  supplierId: string;
  supplierName: string;
  current: number;
  d30: number;
  d60: number;
  d90plus: number;
  total: number;
}

/** One received payment on the cashier/collections report. */
export interface CollectionEntry {
  cashierId: string;
  method: string;
  amount: number;
  paidAt: string;
  billId: string;
  patientName: string;
  patientNo: string | null;
  serviceType: string;
  serviceDescription: string | null;
  isDeposit: boolean;
  mpesaReference: string | null;
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
    @InjectRepository(LabOrder)
    private readonly labOrderRepo: Repository<LabOrder>,
    @InjectRepository(Admission)
    private readonly admRepo: Repository<Admission>,
    @InjectRepository(Bed)
    private readonly bedRepo: Repository<Bed>,
    @InjectRepository(Ward)
    private readonly wardRepo: Repository<Ward>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(InventoryItem)
    private readonly itemRepo: Repository<InventoryItem>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierInvoice)
    private readonly supplierInvoiceRepo: Repository<SupplierInvoice>,
    @InjectRepository(SupplierPayment)
    private readonly supplierPaymentRepo: Repository<SupplierPayment>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunRepo: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
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

  // ── CASHIER / COLLECTIONS ──────────────────────────────────────────────────
  /**
   * Every payment actually received in the period, from each bill's payment
   * history (so partial payments and deposits are counted at the moment money
   * changed hands). Grouped by cashier and by tender — the basis for the cashier
   * summary, the shift/till reconciliation and the cash-position report.
   */
  async collections(facilityId: string, from: Date, to: Date) {
    const fromStart = new Date(from);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    // Any bill with money on it, raised on or before the period end — a payment
    // in the window can sit on a bill raised earlier.
    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.amount_paid > 0')
      .andWhere('b.created_at <= :to', { to: toEnd })
      .getMany();

    const entries: CollectionEntry[] = [];
    const cashierIds = new Set<string>();

    for (const b of bills) {
      const person = b.patient;
      for (const ph of b.paymentHistory ?? []) {
        const paidAt = ph.paidAt ? new Date(ph.paidAt) : null;
        if (!paidAt || paidAt < fromStart || paidAt > toEnd) continue;
        const cashierId = ph.collectedById || '';
        if (cashierId) cashierIds.add(cashierId);
        entries.push({
          cashierId,
          method: ph.paymentMethod || 'cash',
          amount: Number(ph.amount || 0),
          paidAt: paidAt.toISOString(),
          billId: b.id,
          patientName: person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
          patientNo: person?.patientId ?? null,
          serviceType: b.serviceType,
          serviceDescription: b.serviceDescription ?? null,
          isDeposit: !!b.isDeposit,
          mpesaReference: ph.mpesaReference ?? null,
        });
      }
    }

    const users = cashierIds.size
      ? await this.userRepo.find({ where: { id: In([...cashierIds]) } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    const methodSet = new Set<string>();
    const byCashier = new Map<
      string,
      { cashierId: string; cashierName: string; total: number; count: number; methods: Record<string, number> }
    >();
    const byMethod = new Map<string, number>();

    for (const e of entries) {
      methodSet.add(e.method);
      byMethod.set(e.method, r2((byMethod.get(e.method) || 0) + e.amount));
      const key = e.cashierId || 'unknown';
      const g =
        byCashier.get(key) ??
        {
          cashierId: e.cashierId,
          cashierName: nameById.get(e.cashierId) ?? 'Unknown',
          total: 0,
          count: 0,
          methods: {} as Record<string, number>,
        };
      g.total = r2(g.total + e.amount);
      g.count += 1;
      g.methods[e.method] = r2((g.methods[e.method] || 0) + e.amount);
      byCashier.set(key, g);
    }

    return {
      period: { from: fromStart, to: toEnd },
      methods: [...methodSet],
      byCashier: [...byCashier.values()].sort((a, b) => b.total - a.total),
      byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
      total: r2(entries.reduce((s, e) => s + e.amount, 0)),
      depositsCollected: r2(entries.filter((e) => e.isDeposit).reduce((s, e) => s + e.amount, 0)),
      count: entries.length,
      entries: entries.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1)),
    };
  }

  // ── PATIENT CREDITS ────────────────────────────────────────────────────────
  /** Patients holding prepaid credit — admission deposits not yet spent. */
  async patientCredits(facilityId: string) {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const adms = await this.admRepo.find({ where: { facilityId } });
    const withCredit = adms.filter((a) => Number(a.depositBalance || 0) > 0.005);

    const patientIds = [...new Set(withCredit.map((a) => a.patientId))];
    const patients = patientIds.length
      ? await this.patientRepo.find({ where: { id: In(patientIds) } })
      : [];
    const pById = new Map(patients.map((p) => [p.id, p]));

    const rows = withCredit
      .map((a) => {
        const p = pById.get(a.patientId);
        return {
          admissionId: a.id,
          admissionNo: a.admissionNo,
          patientId: a.patientId,
          patientName: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
          patientNo: p?.patientId ?? null,
          status: a.status,
          depositPaid: r2(Number(a.depositPaid || 0)),
          depositBalance: r2(Number(a.depositBalance || 0)),
          admittedAt: a.admittedAt ? new Date(a.admittedAt).toISOString() : null,
        };
      })
      .sort((a, b) => b.depositBalance - a.depositBalance);

    return { rows, total: r2(rows.reduce((s, r) => s + r.depositBalance, 0)) };
  }

  // ── REVERSED / WRITTEN-OFF INVOICES ────────────────────────────────────────
  /** Bills waived (written off) in the period — the reversal trail. */
  async reversedInvoices(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.collectedBy', 'collectedBy')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.status = :waived', { waived: BillingStatus.WAIVED })
      .andWhere('b.updated_at >= :from', { from })
      .andWhere('b.updated_at <= :to', { to: toEnd })
      .orderBy('b.updated_at', 'DESC')
      .getMany();

    const rows = bills.map((b) => {
      const person = b.patient;
      return {
        id: b.id,
        patientName: person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
        patientNo: person?.patientId ?? null,
        serviceType: b.serviceType,
        serviceDescription: b.serviceDescription ?? null,
        amount: r2(Number(b.amount)),
        amountPaid: r2(Number(b.amountPaid || 0)),
        reversedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : null,
        by: b.collectedBy ? `${b.collectedBy.firstName ?? ''} ${b.collectedBy.lastName ?? ''}`.trim() : null,
        visitId: b.visitId ?? null,
      };
    });

    return { rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)), count: rows.length };
  }

  // ── REVENUE SHARING (BY DOCTOR) ────────────────────────────────────────────
  /**
   * Revenue attributed to each attending doctor from the bills on their visits —
   * the basis for doctor revenue-share payouts. A share percentage is applied on
   * the client so the split can be tuned without a schema change.
   */
  async revenueByDoctor(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.visit', 'visit')
      .leftJoinAndSelect('visit.assignedDoctor', 'doctor')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEnd })
      .andWhere('b.status != :waived', { waived: BillingStatus.WAIVED })
      .getMany();

    const map = new Map<
      string,
      { doctorId: string | null; doctorName: string; billed: number; collected: number; count: number }
    >();
    for (const b of bills) {
      const doc = b.visit?.assignedDoctor ?? null;
      const key = doc?.id ?? 'unassigned';
      const g =
        map.get(key) ??
        {
          doctorId: doc?.id ?? null,
          doctorName: doc ? `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim() || 'Doctor' : 'Unassigned',
          billed: 0,
          collected: 0,
          count: 0,
        };
      g.billed = r2(g.billed + Number(b.amount));
      g.collected = r2(g.collected + Number(b.amountPaid || 0));
      g.count += 1;
      map.set(key, g);
    }

    const rows = [...map.values()].sort((a, b) => b.billed - a.billed);
    return {
      period: { from, to: toEnd },
      rows,
      totals: {
        billed: r2(rows.reduce((s, r) => s + r.billed, 0)),
        collected: r2(rows.reduce((s, r) => s + r.collected, 0)),
      },
    };
  }

  // ── PAYROLL STATUTORY (MONTHLY) ────────────────────────────────────────────
  /**
   * One month's payroll as a statutory return: per-employee gross, PAYE, NSSF,
   * SHIF and Housing (with KRA PIN / NSSF / SHIF numbers) plus their bank
   * details for the banking list. Feeds the P10, NSSF/SHIF returns and the bank
   * transfer schedule.
   */
  async payrollStatutory(facilityId: string, month: string) {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const runs = await this.payrollRunRepo.find({ where: { facilityId, periodMonth: month } });
    const runIds = runs.map((r) => r.id);
    const payDate = runs.map((r) => r.payDate).find(Boolean) ?? null;

    const slips = runIds.length ? await this.payslipRepo.find({ where: { payrollRunId: In(runIds) } }) : [];
    const empIds = [...new Set(slips.map((s) => s.employeeId))];
    const emps = empIds.length ? await this.employeeRepo.find({ where: { id: In(empIds) } }) : [];
    const empById = new Map(emps.map((e) => [e.id, e]));

    const map = new Map<
      string,
      {
        employeeNo: string; name: string; kraPin: string | null; nssfNo: string | null; shifNo: string | null;
        bankName: string | null; bankAccount: string | null;
        basic: number; gross: number; paye: number; nssf: number; shif: number; housing: number; net: number;
      }
    >();
    for (const s of slips) {
      const e = empById.get(s.employeeId);
      const g =
        map.get(s.employeeId) ??
        {
          employeeNo: e?.employeeNo ?? '', name: s.employeeName, kraPin: e?.kraPin ?? null,
          nssfNo: e?.nssfNo ?? null, shifNo: e?.shifNo ?? null, bankName: e?.bankName ?? null,
          bankAccount: e?.bankAccount ?? null,
          basic: 0, gross: 0, paye: 0, nssf: 0, shif: 0, housing: 0, net: 0,
        };
      g.basic = r2(g.basic + Number(s.basic));
      g.gross = r2(g.gross + Number(s.grossPay));
      g.paye = r2(g.paye + Number(s.paye));
      g.nssf = r2(g.nssf + Number(s.nssfEmployee));
      g.shif = r2(g.shif + Number(s.shif));
      g.housing = r2(g.housing + Number(s.housingEmployee));
      g.net = r2(g.net + Number(s.netPay));
      map.set(s.employeeId, g);
    }

    const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sum = (k: 'basic' | 'gross' | 'paye' | 'nssf' | 'shif' | 'housing' | 'net') =>
      r2(rows.reduce((s, r) => s + r[k], 0));

    return {
      month,
      payDate,
      runs: runs.length,
      rows,
      totals: {
        basic: sum('basic'), gross: sum('gross'), paye: sum('paye'),
        nssf: sum('nssf'), shif: sum('shif'), housing: sum('housing'), net: sum('net'),
      },
    };
  }

  // ── PAYROLL ANNUAL (P9A / YEARLY) ──────────────────────────────────────────
  /** A year's pay per employee — annual totals plus a month-by-month gross/PAYE grid. */
  async payrollAnnual(facilityId: string, year: string) {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const runs = await this.payrollRunRepo
      .createQueryBuilder('r')
      .where('r.facility_id = :facilityId', { facilityId })
      .andWhere('r.period_month LIKE :y', { y: `${year}-%` })
      .getMany();
    const monthByRun = new Map(runs.map((r) => [r.id, r.periodMonth.slice(5, 7)]));
    const runIds = runs.map((r) => r.id);

    const slips = runIds.length ? await this.payslipRepo.find({ where: { payrollRunId: In(runIds) } }) : [];
    const empIds = [...new Set(slips.map((s) => s.employeeId))];
    const emps = empIds.length ? await this.employeeRepo.find({ where: { id: In(empIds) } }) : [];
    const empById = new Map(emps.map((e) => [e.id, e]));

    const map = new Map<
      string,
      {
        employeeNo: string; name: string; kraPin: string | null;
        gross: number; paye: number; nssf: number; shif: number; housing: number; net: number;
        months: Record<string, { gross: number; paye: number }>;
      }
    >();
    const monthlyTotals: Record<string, { gross: number; paye: number; net: number }> = {};

    for (const s of slips) {
      const mm = monthByRun.get(s.payrollRunId) ?? '00';
      const e = empById.get(s.employeeId);
      const g =
        map.get(s.employeeId) ??
        {
          employeeNo: e?.employeeNo ?? '', name: s.employeeName, kraPin: e?.kraPin ?? null,
          gross: 0, paye: 0, nssf: 0, shif: 0, housing: 0, net: 0, months: {} as Record<string, { gross: number; paye: number }>,
        };
      const gross = Number(s.grossPay);
      const paye = Number(s.paye);
      g.gross = r2(g.gross + gross);
      g.paye = r2(g.paye + paye);
      g.nssf = r2(g.nssf + Number(s.nssfEmployee));
      g.shif = r2(g.shif + Number(s.shif));
      g.housing = r2(g.housing + Number(s.housingEmployee));
      g.net = r2(g.net + Number(s.netPay));
      const m = g.months[mm] ?? { gross: 0, paye: 0 };
      m.gross = r2(m.gross + gross);
      m.paye = r2(m.paye + paye);
      g.months[mm] = m;
      map.set(s.employeeId, g);

      const mt = monthlyTotals[mm] ?? { gross: 0, paye: 0, net: 0 };
      mt.gross = r2(mt.gross + gross);
      mt.paye = r2(mt.paye + paye);
      mt.net = r2(mt.net + Number(s.netPay));
      monthlyTotals[mm] = mt;
    }

    const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      year,
      rows,
      monthlyTotals,
      totals: {
        gross: r2(rows.reduce((s, r) => s + r.gross, 0)),
        paye: r2(rows.reduce((s, r) => s + r.paye, 0)),
        net: r2(rows.reduce((s, r) => s + r.net, 0)),
      },
    };
  }

  // ── SUPPLIER AGED PAYABLES / BALANCES ──────────────────────────────────────
  /**
   * What the facility owes suppliers as of a date, from unpaid/part-paid
   * supplier invoices, aged into 0–30 / 31–60 / 61–90 / 90+ day buckets by
   * invoice date. Each supplier row also carries their total balance.
   */
  async supplierPayables(facilityId: string, asOf: Date) {
    const asOfEnd = new Date(asOf);
    asOfEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const invoices = await this.supplierInvoiceRepo
      .createQueryBuilder('i')
      .where('i.facility_id = :facilityId', { facilityId })
      .andWhere('i.status != :paid', { paid: 'paid' })
      .andWhere('i.date <= :asOf', { asOf: asOfEnd.toISOString().slice(0, 10) })
      .getMany();

    const supplierIds = [...new Set(invoices.map((i) => i.supplierId))];
    const suppliers = supplierIds.length
      ? await this.supplierRepo.find({ where: { id: In(supplierIds) } })
      : [];
    const nameById = new Map(suppliers.map((s) => [s.id, s.name]));

    const map = new Map<string, SupplierPayableRow>();
    const totals = { current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 };

    for (const inv of invoices) {
      const outstanding = Number(inv.total) - Number(inv.amountPaid || 0);
      if (!(outstanding > 0.005)) continue;
      const ageDays = Math.floor((asOfEnd.getTime() - new Date(inv.date).getTime()) / 86400000);
      const g =
        map.get(inv.supplierId) ??
        {
          supplierId: inv.supplierId,
          supplierName: nameById.get(inv.supplierId) ?? 'Supplier',
          current: 0,
          d30: 0,
          d60: 0,
          d90plus: 0,
          total: 0,
        };
      const bucket: 'current' | 'd30' | 'd60' | 'd90plus' =
        ageDays <= 30 ? 'current' : ageDays <= 60 ? 'd30' : ageDays <= 90 ? 'd60' : 'd90plus';
      g[bucket] = r2(g[bucket] + outstanding);
      g.total = r2(g.total + outstanding);
      totals[bucket] = r2(totals[bucket] + outstanding);
      totals.total = r2(totals.total + outstanding);
      map.set(inv.supplierId, g);
    }

    return {
      asOf: asOfEnd,
      rows: [...map.values()].sort((a, b) => b.total - a.total),
      totals,
    };
  }

  // ── SUPPLIER REMITTANCES ───────────────────────────────────────────────────
  /** Payments made to suppliers in a period — the remittance trail. */
  async supplierRemittances(facilityId: string, from: Date, to: Date) {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const fromStr = new Date(from).toISOString().slice(0, 10);
    const toStr = new Date(to).toISOString().slice(0, 10);

    const payments = await this.supplierPaymentRepo
      .createQueryBuilder('p')
      .where('p.facility_id = :facilityId', { facilityId })
      .andWhere('p.date >= :from', { from: fromStr })
      .andWhere('p.date <= :to', { to: toStr })
      .orderBy('p.date', 'DESC')
      .getMany();

    const supplierIds = [...new Set(payments.map((p) => p.supplierId))];
    const suppliers = supplierIds.length
      ? await this.supplierRepo.find({ where: { id: In(supplierIds) } })
      : [];
    const nameById = new Map(suppliers.map((s) => [s.id, s.name]));

    const byMethod = new Map<string, number>();
    const rows = payments.map((p) => {
      byMethod.set(p.method, r2((byMethod.get(p.method) || 0) + Number(p.amount)));
      return {
        id: p.id,
        paymentNo: p.paymentNo,
        date: p.date,
        supplierName: nameById.get(p.supplierId) ?? 'Supplier',
        amount: r2(Number(p.amount)),
        method: p.method,
      };
    });

    return {
      period: { from: fromStr, to: toStr },
      rows,
      byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
      total: r2(rows.reduce((s, r) => s + r.amount, 0)),
      count: rows.length,
    };
  }

  // ── PHARMACY SALES ─────────────────────────────────────────────────────────
  /**
   * Pharmacy sales for a period, from the billed pharmacy lines (drugs/vaccines
   * dispensed). Broken down by item, by group (item category), by patient, and
   * split inpatient vs outpatient (by the visit type the bill sits on).
   */
  async pharmacySales(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEnd })
      .andWhere('b.service_type = :pharmacy', { pharmacy: 'pharmacy' })
      .andWhere('b.status != :waived', { waived: BillingStatus.WAIVED })
      .getMany();

    const itemIds = [...new Set(bills.map((b) => b.itemId).filter((x): x is string => !!x))];
    const items = itemIds.length ? await this.itemRepo.find({ where: { id: In(itemIds) } }) : [];
    const itemById = new Map(items.map((i) => [i.id, i]));

    const byItem = new Map<string, { name: string; category: string; qty: number; revenue: number; count: number }>();
    const byGroup = new Map<string, { group: string; qty: number; revenue: number; count: number }>();
    const byPatient = new Map<string, { patientName: string; patientNo: string | null; revenue: number; count: number }>();
    const inpatientByItem = new Map<string, { name: string; qty: number; revenue: number; count: number }>();
    const split = { inpatient: { revenue: 0, qty: 0, count: 0 }, outpatient: { revenue: 0, qty: 0, count: 0 } };

    for (const b of bills) {
      const amount = Number(b.amount);
      const qty = Number(b.quantity || 0);
      const item = b.itemId ? itemById.get(b.itemId) : null;
      const name = item?.name || b.serviceDescription?.trim() || 'Pharmacy item';
      const category = item?.category || 'Uncategorised';
      const isInpatient = b.visit?.visitType === 'inpatient';

      const iKey = b.itemId || name.toLowerCase();
      const gi = byItem.get(iKey) ?? { name, category, qty: 0, revenue: 0, count: 0 };
      gi.qty = r2(gi.qty + qty);
      gi.revenue = r2(gi.revenue + amount);
      gi.count += 1;
      byItem.set(iKey, gi);

      const gg = byGroup.get(category) ?? { group: category, qty: 0, revenue: 0, count: 0 };
      gg.qty = r2(gg.qty + qty);
      gg.revenue = r2(gg.revenue + amount);
      gg.count += 1;
      byGroup.set(category, gg);

      const person = b.patient ?? b.visit?.patient;
      const pKey = person?.id || 'unknown';
      const gp =
        byPatient.get(pKey) ??
        {
          patientName: person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
          patientNo: person?.patientId ?? null,
          revenue: 0,
          count: 0,
        };
      gp.revenue = r2(gp.revenue + amount);
      gp.count += 1;
      byPatient.set(pKey, gp);

      const bucket = isInpatient ? split.inpatient : split.outpatient;
      bucket.revenue = r2(bucket.revenue + amount);
      bucket.qty = r2(bucket.qty + qty);
      bucket.count += 1;

      if (isInpatient) {
        const ii = inpatientByItem.get(iKey) ?? { name, qty: 0, revenue: 0, count: 0 };
        ii.qty = r2(ii.qty + qty);
        ii.revenue = r2(ii.revenue + amount);
        ii.count += 1;
        inpatientByItem.set(iKey, ii);
      }
    }

    return {
      period: { from, to: toEnd },
      byItem: [...byItem.values()].sort((a, b) => b.revenue - a.revenue),
      byGroup: [...byGroup.values()].sort((a, b) => b.revenue - a.revenue),
      byPatient: [...byPatient.values()].sort((a, b) => b.revenue - a.revenue),
      inpatientByItem: [...inpatientByItem.values()].sort((a, b) => b.revenue - a.revenue),
      split,
      totals: {
        count: bills.length,
        qty: r2(bills.reduce((s, b) => s + Number(b.quantity || 0), 0)),
        revenue: r2(bills.reduce((s, b) => s + Number(b.amount), 0)),
      },
    };
  }

  // ── OUT-PATIENT TURNAROUND TIME (TAT) ──────────────────────────────────────
  /**
   * How long outpatients spend in the facility: check-in → triage → completion.
   * There's no explicit completion stamp, so a completed visit's `updatedAt`
   * (its last transition) is used as the completion time. Inpatient anchor
   * visits are excluded.
   */
  async outpatientTat(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const mins = (a?: Date | null, b?: Date | null): number | null =>
      a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : null;

    const visits = await this.visitsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.patient', 'patient')
      .leftJoinAndSelect('v.assignedDoctor', 'doctor')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.created_at >= :from', { from })
      .andWhere('v.created_at <= :to', { to: toEnd })
      .andWhere('v.status != :cancelled', { cancelled: VisitStatus.CANCELLED })
      .orderBy('v.created_at', 'DESC')
      .getMany();

    const rows = visits
      .filter((v) => v.visitType !== 'inpatient')
      .map((v) => {
        const start = v.checkedInAt ?? v.createdAt;
        const completed = v.status === VisitStatus.COMPLETED;
        const p = v.patient;
        return {
          visitId: v.id,
          patientName: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient' : 'Patient',
          patientNo: p?.patientId ?? null,
          doctor: v.assignedDoctor
            ? `${v.assignedDoctor.firstName ?? ''} ${v.assignedDoctor.lastName ?? ''}`.trim()
            : null,
          checkedInAt: start ? new Date(start).toISOString() : null,
          triagedAt: v.triagedAt ? new Date(v.triagedAt).toISOString() : null,
          completedAt: completed && v.updatedAt ? new Date(v.updatedAt).toISOString() : null,
          status: v.status,
          triageWaitMins: mins(start, v.triagedAt),
          totalMins: completed ? mins(start, v.updatedAt) : null,
        };
      });

    const totalVals = rows.map((r) => r.totalMins).filter((n): n is number => n != null);
    const triageVals = rows.map((r) => r.triageWaitMins).filter((n): n is number => n != null);
    const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

    return {
      period: { from, to: toEnd },
      rows,
      summary: {
        visits: rows.length,
        completed: totalVals.length,
        avgTotalMins: avg(totalVals),
        avgTriageWaitMins: avg(triageVals),
      },
    };
  }

  // ── DIAGNOSIS BY COUNTY ────────────────────────────────────────────────────
  /** Consultations with a diagnosis, grouped by the patient's county — surveillance. */
  async diagnosisByCounty(facilityId: string, from: Date, to: Date) {
    const fromStart = new Date(from);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const notes = await this.soapRepo.find({
      where: { facilityId, createdAt: Between(fromStart, toEnd) },
    });

    const map = new Map<string, { county: string; cases: number; patients: Set<string> }>();
    let withDiagnosis = 0;
    for (const n of notes) {
      const hasDx = !!(n.diagnosis?.trim() || n.icd10Code?.trim());
      if (!hasDx) continue;
      withDiagnosis += 1;
      const county = n.patient?.county?.trim() || 'Unknown';
      const g = map.get(county) ?? { county, cases: 0, patients: new Set<string>() };
      g.cases += 1;
      if (n.patientId) g.patients.add(n.patientId);
      map.set(county, g);
    }

    const rows = [...map.values()]
      .map((g) => ({ county: g.county, cases: g.cases, patients: g.patients.size }))
      .sort((a, b) => b.cases - a.cases);

    return { period: { from: fromStart, to: toEnd }, rows, total: withDiagnosis };
  }

  // ── SERVICES STATISTICS ────────────────────────────────────────────────────
  /** Utilisation of billed services: volume and revenue by type and by service. */
  async servicesStatistics(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEnd })
      .andWhere('b.status != :waived', { waived: BillingStatus.WAIVED })
      .getMany();

    const byType = new Map<string, { type: string; count: number; revenue: number }>();
    const byService = new Map<string, { name: string; type: string; count: number; revenue: number }>();
    for (const b of bills) {
      const amount = Number(b.amount);
      const t = byType.get(b.serviceType) ?? { type: b.serviceType, count: 0, revenue: 0 };
      t.count += 1;
      t.revenue = r2(t.revenue + amount);
      byType.set(b.serviceType, t);

      const name = b.serviceDescription?.trim() || b.serviceType;
      const key = `${b.serviceType}:${name.toLowerCase()}`;
      const s = byService.get(key) ?? { name, type: b.serviceType, count: 0, revenue: 0 };
      s.count += 1;
      s.revenue = r2(s.revenue + amount);
      byService.set(key, s);
    }

    return {
      period: { from, to: toEnd },
      byType: [...byType.values()].sort((a, b) => b.revenue - a.revenue),
      topServices: [...byService.values()].sort((a, b) => b.count - a.count).slice(0, 50),
      totals: {
        count: bills.length,
        revenue: r2(bills.reduce((s, b) => s + Number(b.amount), 0)),
      },
    };
  }

  // ── CONSULTATIONS REPORT ───────────────────────────────────────────────────
  /** Consultations (SOAP notes) in a period, tallied by attending clinician. */
  async consultationsReport(facilityId: string, from: Date, to: Date) {
    const fromStart = new Date(from);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const notes = await this.soapRepo.find({
      where: { facilityId, createdAt: Between(fromStart, toEnd) },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });

    const byDoctor = new Map<string, { doctorId: string; doctorName: string; count: number; withDiagnosis: number }>();
    for (const n of notes) {
      const doc = n.createdBy;
      const key = n.createdById || 'unknown';
      const g =
        byDoctor.get(key) ??
        {
          doctorId: n.createdById,
          doctorName: doc ? `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim() || 'Clinician' : 'Unknown',
          count: 0,
          withDiagnosis: 0,
        };
      g.count += 1;
      if (n.diagnosis?.trim() || n.icd10Code?.trim()) g.withDiagnosis += 1;
      byDoctor.set(key, g);
    }

    const recent = notes.slice(0, 100).map((n) => ({
      id: n.id,
      patientName: n.patient
        ? `${n.patient.firstName ?? ''} ${n.patient.lastName ?? ''}`.trim() || 'Patient'
        : 'Patient',
      patientNo: n.patient?.patientId ?? null,
      diagnosis: n.diagnosis?.trim() || n.icd10Description?.trim() || null,
      icd10: n.icd10Code?.trim() || null,
      doctor: n.createdBy ? `${n.createdBy.firstName ?? ''} ${n.createdBy.lastName ?? ''}`.trim() : null,
      createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : null,
    }));

    return {
      period: { from: fromStart, to: toEnd },
      total: notes.length,
      withDiagnosis: notes.filter((n) => n.diagnosis?.trim() || n.icd10Code?.trim()).length,
      byDoctor: [...byDoctor.values()].sort((a, b) => b.count - a.count),
      recent,
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

  // ── MOH 706 LABORATORY MONTHLY SUMMARY ─────────────────────────────────────
  // Volume of tests done in the period, grouped by department and test. A test
  // counts as completed once it has been resulted or verified.
  async labSummary(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const orders = await this.labOrderRepo
      .createQueryBuilder('o')
      .where('o.facility_id = :facilityId', { facilityId })
      .andWhere('o.created_at >= :from', { from })
      .andWhere('o.created_at <= :to', { to: toEnd })
      .getMany(); // items are eager

    const DONE = new Set(['resulted', 'verified']);
    const map = new Map<string, { department: string; testName: string; total: number; completed: number }>();
    for (const o of orders) {
      for (const it of o.items ?? []) {
        const department = it.department || 'General';
        const key = `${department}::${it.testName}`;
        const g = map.get(key) ?? { department, testName: it.testName, total: 0, completed: 0 };
        g.total += 1;
        if (DONE.has(it.status)) g.completed += 1;
        map.set(key, g);
      }
    }

    const rows = [...map.values()].sort(
      (a, b) => a.department.localeCompare(b.department) || b.total - a.total,
    );
    return {
      period: { from, to: toEnd },
      rows,
      totals: {
        tests: rows.length,
        total: rows.reduce((s, r) => s + r.total, 0),
        completed: rows.reduce((s, r) => s + r.completed, 0),
      },
    };
  }

  // ── MOH 328 DAILY BED RETURN ───────────────────────────────────────────────
  // Per ward: admissions and discharges (and deaths) in the period, plus the
  // current bed capacity / occupancy.
  async bedReturn(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const wards = await this.wardRepo.find({ where: { facilityId }, order: { name: 'ASC' } });
    const beds = await this.bedRepo.find({ where: { facilityId } });
    const admissions = await this.admRepo.find({ where: { facilityId } });

    const inRange = (d: Date | null | undefined) => !!d && d >= from && d <= toEnd;

    const rows = wards.map((w) => {
      const wb = beds.filter((b) => b.wardId === w.id && b.isActive);
      const wa = admissions.filter((a) => a.wardId === w.id);
      const admitted = wa.filter((a) => inRange(a.admittedAt)).length;
      const discharged = wa.filter((a) => inRange(a.dischargedAt) && a.outcome !== 'deceased').length;
      const deaths = wa.filter((a) => inRange(a.dischargedAt) && a.outcome === 'deceased').length;
      const occupied = wb.filter((b) => b.status === 'occupied').length;
      return {
        wardId: w.id,
        wardName: w.name,
        wardType: w.wardType,
        beds: wb.length,
        occupied,
        available: wb.filter((b) => b.status === 'available').length,
        admissions: admitted,
        discharges: discharged,
        deaths,
      };
    });

    const sum = (k: 'beds' | 'occupied' | 'available' | 'admissions' | 'discharges' | 'deaths') =>
      rows.reduce((s, r) => s + r[k], 0);
    const beds_ = sum('beds');
    return {
      period: { from, to: toEnd },
      wards: rows,
      totals: {
        beds: beds_,
        occupied: sum('occupied'),
        available: sum('available'),
        admissions: sum('admissions'),
        discharges: sum('discharges'),
        deaths: sum('deaths'),
        occupancyRate: beds_ > 0 ? Math.round((sum('occupied') / beds_) * 1000) / 10 : 0,
      },
    };
  }

  // ── MOH 717 MONTHLY SERVICE WORKLOAD SUMMARY ───────────────────────────────
  // Outpatient attendance + service workload + lab/inpatient totals for the month.
  async workload(facilityId: string, from: Date, to: Date) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    const register = await this.outpatientRegister(facilityId, from, to);
    const lab = await this.labSummary(facilityId, from, to);
    const beds = await this.bedReturn(facilityId, from, to);

    const ru = register.totals.under5;
    const ro = register.totals.over5;
    const outpatient = {
      under5: { total: ru.total, new: ru.new, revisit: ru.revisit, male: ru.male, female: ru.female },
      over5: { total: ro.total, new: ro.new, revisit: ro.revisit, male: ro.male, female: ro.female },
      total: ru.total + ro.total,
      newAttendances: ru.new + ro.new,
      reAttendances: ru.revisit + ro.revisit,
      referralsIn: ru.referredIn + ro.referredIn,
    };

    // Service workload — count billed services by type in the period.
    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEnd })
      .andWhere('b.status != :waived', { waived: BillingStatus.WAIVED })
      .getMany();
    const services: Record<string, number> = {};
    for (const b of bills) services[b.serviceType] = (services[b.serviceType] || 0) + 1;

    return {
      period: { from, to: toEnd },
      outpatient,
      services, // { consultation, lab, imaging, pharmacy, procedure, other, … }
      laboratory: { tests: lab.totals.total, completed: lab.totals.completed },
      inpatient: {
        admissions: beds.totals.admissions,
        discharges: beds.totals.discharges,
        deaths: beds.totals.deaths,
        beds: beds.totals.beds,
        occupied: beds.totals.occupied,
        occupancyRate: beds.totals.occupancyRate,
      },
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