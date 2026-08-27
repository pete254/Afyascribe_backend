import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { Payslip, PayComponent } from './entities/payslip.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreatePayrollRunDto,
  UpdatePayrollSettingsDto,
} from './dto/payroll.dto';
import { computeStatutory, StatutoryConfig, DEFAULT_STATUTORY_CONFIG } from './data/statutory';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const sum = (xs: (number | string)[]) => r2(xs.map(Number).reduce((s, x) => s + x, 0));

/** Withholding-tax rate for contracted staff (in lieu of PAYE/statutory). */
const WHT_RATE = 0.05;
/** Employment types that are on withholding tax rather than PAYE. */
const isContracted = (type?: string | null): boolean =>
  ['contracted', 'contract', 'consultant'].includes((type ?? '').toLowerCase());

/** One payslip as a line on the payroll ledger. */
export interface PayrollLedgerEntry {
  payslipId: string;
  runId: string;
  runNo: string;
  period: string;
  payDate: string | null;
  status: 'draft' | 'approved' | 'paid';
  employeeId: string;
  employeeName: string;
  gross: number;
  paye: number;
  nssfEmployee: number;
  shif: number;
  housingEmployee: number;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  employerCost: number;
}

/** One payroll run rolled up — the payroll cost register line. */
export interface PayrollLedgerRun {
  id: string;
  runNo: string;
  period: string;
  payDate: string | null;
  status: 'draft' | 'approved' | 'paid';
  employees: number;
  gross: number;
  paye: number;
  statutory: number;
  net: number;
  employerCost: number;
}

/** One employee's earnings across the period — their pay record. */
export interface PayrollLedgerEmployee {
  employeeId: string;
  employeeName: string;
  periods: number;
  gross: number;
  paye: number;
  statutory: number;
  totalDeductions: number;
  net: number;
}

export interface PayrollLedger {
  summary: {
    runs: number;
    employees: number;
    gross: number;
    paye: number;
    nssf: number;
    shif: number;
    housing: number;
    otherDeductions: number;
    net: number;
    employerCost: number;
  };
  byPeriod: PayrollLedgerRun[];
  byEmployee: PayrollLedgerEmployee[];
  entries: PayrollLedgerEntry[];
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(PayrollRun)
    private readonly runs: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslips: Repository<Payslip>,
    @InjectRepository(PayrollSettings)
    private readonly settings: Repository<PayrollSettings>,
    private readonly posting: HmisPostingService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Settings ──────────────────────────────────────────────────────────────────

  /** The facility's payroll settings, seeded from the statutory defaults once. */
  async getSettings(facilityId: string): Promise<PayrollSettings> {
    let s = await this.settings.findOne({ where: { facilityId } });
    if (!s) {
      s = await this.settings.save(this.settings.create({ facilityId }));
    }
    return s;
  }

  async updateSettings(facilityId: string, dto: UpdatePayrollSettingsDto): Promise<PayrollSettings> {
    const s = await this.getSettings(facilityId);
    const numeric = ['nssfRate', 'nssfUpperLimit', 'shifRate', 'shifMin', 'housingRate', 'personalRelief'] as const;
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      if ((numeric as readonly string[]).includes(k)) (s as any)[k] = String(v);
      else (s as any)[k] = v;
    }
    return this.settings.save(s);
  }

  /** Build the effective statutory config for one employee (facility ∧ employee). */
  private configFor(settings: PayrollSettings, emp: Employee): StatutoryConfig {
    return {
      applyPaye: settings.payeEnabled && emp.applyPaye,
      applyNssf: settings.nssfEnabled && emp.applyNssf,
      applyShif: settings.shifEnabled && emp.applyShif,
      applyHousing: settings.housingEnabled && emp.applyHousing,
      nssfRate: Number(settings.nssfRate),
      nssfUpperLimit: Number(settings.nssfUpperLimit),
      shifRate: Number(settings.shifRate),
      shifMin: Number(settings.shifMin),
      housingRate: Number(settings.housingRate),
      personalRelief: Number(settings.personalRelief),
      payeBands: settings.payeBands?.length ? settings.payeBands : DEFAULT_STATUTORY_CONFIG.payeBands,
    };
  }

  // ── Employees ─────────────────────────────────────────────────────────────────

  async createEmployee(facilityId: string, dto: CreateEmployeeDto): Promise<Employee> {
    let employeeNo = dto.employeeNo?.trim();
    if (!employeeNo) {
      const count = await this.employees.count({ where: { facilityId } });
      employeeNo = `EMP-${String(count + 1).padStart(5, '0')}`;
    }
    const employee = this.employees.create({
      facilityId,
      employeeNo,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      basicSalary: String(dto.basicSalary),
      nationalId: dto.nationalId ?? null,
      kraPin: dto.kraPin ?? null,
      nssfNo: dto.nssfNo ?? null,
      shifNo: dto.shifNo ?? null,
      jobTitle: dto.jobTitle ?? null,
      department: dto.department ?? null,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      employmentType: dto.employmentType ?? 'permanent',
      hireDate: dto.hireDate ?? null,
      userId: dto.userId ?? null,
      applyPaye: dto.applyPaye ?? true,
      applyNssf: dto.applyNssf ?? true,
      applyShif: dto.applyShif ?? true,
      applyHousing: dto.applyHousing ?? true,
      allowances: dto.allowances?.length ? dto.allowances : null,
      deductions: dto.deductions?.length ? dto.deductions : null,
      nextOfKin: dto.nextOfKin?.length ? dto.nextOfKin : null,
    });
    return this.employees.save(employee);
  }

  listEmployees(facilityId: string, activeOnly = false): Promise<Employee[]> {
    const where: any = { facilityId };
    if (activeOnly) where.isActive = true;
    return this.employees.find({ where, order: { firstName: 'ASC' } });
  }

  async getEmployee(facilityId: string, id: string): Promise<Employee> {
    const e = await this.employees.findOne({ where: { id, facilityId } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  async updateEmployee(facilityId: string, id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    const e = await this.getEmployee(facilityId, id);
    Object.assign(e, {
      ...dto,
      ...(dto.basicSalary !== undefined ? { basicSalary: String(dto.basicSalary) } : {}),
    });
    return this.employees.save(e);
  }

  // ── Payroll runs ────────────────────────────────────────────────────────────

  /** Build a draft run: compute each payslip and the run totals. */
  async createRun(facilityId: string, dto: CreatePayrollRunDto, userId?: string): Promise<PayrollRun> {
    // Which employees, with what allowances/deductions.
    let entries = dto.entries;
    if (!entries || entries.length === 0) {
      const active = await this.listEmployees(facilityId, true);
      entries = active.map((e) => ({ employeeId: e.id }));
    }
    if (entries.length === 0) throw new BadRequestException('No employees to run payroll for');

    const empIds = entries.map((e) => e.employeeId);
    const emps = await this.employees.find({ where: empIds.map((id) => ({ id, facilityId })) });
    const byId = new Map(emps.map((e) => [e.id, e]));
    const settings = await this.getSettings(facilityId);

    const slips: Payslip[] = [];
    for (const entry of entries) {
      const emp = byId.get(entry.employeeId);
      if (!emp) throw new BadRequestException(`Unknown employee ${entry.employeeId}`);

      // Run-entry components override the employee's recurring ones for this run.
      const allowances = (entry.allowances ?? emp.allowances ?? []) as PayComponent[];
      const otherDeds = (entry.otherDeductions ?? emp.deductions ?? []) as PayComponent[];
      const basic = Number(emp.basicSalary);
      const gross = r2(basic + sum(allowances.map((a) => a.amount)));

      // Contracted staff aren't on PAYE/NSSF/SHIF/housing — instead a flat 5%
      // withholding tax is deducted from their gross and remitted to KRA.
      const contracted = isContracted(emp.employmentType);
      const s = contracted
        ? { paye: 0, nssfEmployee: 0, nssfEmployer: 0, shif: 0, housingEmployee: 0, housingEmployer: 0 }
        : computeStatutory(gross, this.configFor(settings, emp));
      const wht = contracted ? r2(gross * WHT_RATE) : 0;
      const otherTotal = sum(otherDeds.map((d) => d.amount));
      const totalDeductions = r2(
        s.paye + wht + s.nssfEmployee + s.shif + s.housingEmployee + otherTotal,
      );
      const netPay = r2(gross - totalDeductions);

      slips.push(
        this.payslips.create({
          facilityId,
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          basic: basic.toFixed(2),
          allowances: allowances.length ? allowances : null,
          grossPay: gross.toFixed(2),
          paye: s.paye.toFixed(2),
          wht: wht.toFixed(2),
          nssfEmployee: s.nssfEmployee.toFixed(2),
          nssfEmployer: s.nssfEmployer.toFixed(2),
          shif: s.shif.toFixed(2),
          housingEmployee: s.housingEmployee.toFixed(2),
          housingEmployer: s.housingEmployer.toFixed(2),
          otherDeductions: otherDeds.length ? otherDeds : null,
          totalDeductions: totalDeductions.toFixed(2),
          netPay: netPay.toFixed(2),
        }),
      );
    }

    const totalGross = sum(slips.map((s) => s.grossPay));
    const totalPaye = sum(slips.map((s) => s.paye));
    const totalNet = sum(slips.map((s) => s.netPay));
    const totalStatutory = sum(
      slips.map(
        (s) =>
          Number(s.paye) + Number(s.wht) + Number(s.nssfEmployee) + Number(s.shif) + Number(s.housingEmployee),
      ),
    );
    const totalEmployerCost = sum(slips.map((s) => Number(s.nssfEmployer) + Number(s.housingEmployer)));

    const count = await this.runs.count({ where: { facilityId } });
    const run = this.runs.create({
      facilityId,
      runNo: `PR-${String(count + 1).padStart(5, '0')}`,
      periodMonth: dto.periodMonth,
      payDate: dto.payDate ?? null,
      bankAccountCode: dto.bankAccountCode ?? '11003',
      status: 'draft',
      totalGross: totalGross.toFixed(2),
      totalPaye: totalPaye.toFixed(2),
      totalStatutory: totalStatutory.toFixed(2),
      totalNet: totalNet.toFixed(2),
      totalEmployerCost: totalEmployerCost.toFixed(2),
      createdById: userId ?? null,
      payslips: slips,
    });
    return this.runs.save(run);
  }

  listRuns(facilityId: string): Promise<PayrollRun[]> {
    return this.runs.find({ where: { facilityId }, order: { createdAt: 'DESC' }, take: 60 });
  }

  async getRun(facilityId: string, id: string): Promise<PayrollRun> {
    const run = await this.runs.findOne({ where: { id, facilityId }, relations: ['payslips'] });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  // ── PAYROLL LEDGER ──────────────────────────────────────────────────────────
  // The payroll cost record: every run and every payslip, three ways. `byPeriod`
  // is the payroll register (one line per run — gross, PAYE, statutory, net,
  // employer cost); `byEmployee` is each person's earnings record over the
  // period; `entries` is every payslip so the web can drill into one employee's
  // history with no extra calls. Statutory here = employee-side deductions the
  // facility remits (PAYE + NSSF + SHIF + Housing + other), which reconcile to
  // the payroll accrual journals. Bounded by pay-period month.
  async payrollLedger(
    facilityId: string,
    from?: string,
    to?: string,
    status?: 'draft' | 'approved' | 'paid',
  ): Promise<PayrollLedger> {
    const runs = await this.runs.find({
      where: { facilityId },
      relations: ['payslips'],
      order: { periodMonth: 'ASC', createdAt: 'ASC' },
    });

    const fromM = from ? from.slice(0, 7) : null;
    const toM = to ? to.slice(0, 7) : null;

    const inWindow = runs.filter((r) => {
      if (status && r.status !== status) return false;
      if (fromM && r.periodMonth < fromM) return false;
      if (toM && r.periodMonth > toM) return false;
      return true;
    });

    const entries: PayrollLedgerEntry[] = [];
    const byPeriod: PayrollLedgerRun[] = [];
    const empMap = new Map<string, PayrollLedgerEmployee>();

    for (const run of inWindow) {
      const slips = run.payslips ?? [];
      let runGross = 0, runPaye = 0, runStatutory = 0, runNet = 0, runEmployerCost = 0;

      for (const s of slips) {
        const gross = Number(s.grossPay) || 0;
        const paye = Number(s.paye) || 0;
        const nssfEmployee = Number(s.nssfEmployee) || 0;
        const shif = Number(s.shif) || 0;
        const housingEmployee = Number(s.housingEmployee) || 0;
        const otherDeductions = (s.otherDeductions ?? []).reduce((t, d) => t + (Number(d.amount) || 0), 0);
        const totalDeductions = Number(s.totalDeductions) || 0;
        const net = Number(s.netPay) || 0;
        const employerCost = (Number(s.nssfEmployer) || 0) + (Number(s.housingEmployer) || 0);
        const statutory = paye + nssfEmployee + shif + housingEmployee + otherDeductions;

        entries.push({
          payslipId: s.id,
          runId: run.id,
          runNo: run.runNo,
          period: run.periodMonth,
          payDate: run.payDate,
          status: run.status,
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          gross: r2(gross),
          paye: r2(paye),
          nssfEmployee: r2(nssfEmployee),
          shif: r2(shif),
          housingEmployee: r2(housingEmployee),
          otherDeductions: r2(otherDeductions),
          totalDeductions: r2(totalDeductions),
          net: r2(net),
          employerCost: r2(employerCost),
        });

        runGross += gross;
        runPaye += paye;
        runStatutory += statutory;
        runNet += net;
        runEmployerCost += employerCost;

        const agg =
          empMap.get(s.employeeId) ??
          { employeeId: s.employeeId, employeeName: s.employeeName, periods: 0, gross: 0, paye: 0, statutory: 0, totalDeductions: 0, net: 0 };
        agg.periods += 1;
        agg.gross += gross;
        agg.paye += paye;
        agg.statutory += statutory;
        agg.totalDeductions += totalDeductions;
        agg.net += net;
        empMap.set(s.employeeId, agg);
      }

      byPeriod.push({
        id: run.id,
        runNo: run.runNo,
        period: run.periodMonth,
        payDate: run.payDate,
        status: run.status,
        employees: slips.length,
        gross: r2(runGross),
        paye: r2(runPaye),
        statutory: r2(runStatutory),
        net: r2(runNet),
        employerCost: r2(runEmployerCost),
      });
    }

    // Newest period first for the register; biggest earners first for the roster.
    byPeriod.sort((a, b) => b.period.localeCompare(a.period));
    entries.sort((a, b) => b.period.localeCompare(a.period) || a.employeeName.localeCompare(b.employeeName));
    const byEmployee = [...empMap.values()]
      .map((e) => ({
        ...e,
        gross: r2(e.gross),
        paye: r2(e.paye),
        statutory: r2(e.statutory),
        totalDeductions: r2(e.totalDeductions),
        net: r2(e.net),
      }))
      .sort((a, b) => b.gross - a.gross);

    const summary = {
      runs: byPeriod.length,
      employees: empMap.size,
      gross: sum(entries.map((e) => e.gross)),
      paye: sum(entries.map((e) => e.paye)),
      nssf: sum(entries.map((e) => e.nssfEmployee)),
      shif: sum(entries.map((e) => e.shif)),
      housing: sum(entries.map((e) => e.housingEmployee)),
      otherDeductions: sum(entries.map((e) => e.otherDeductions)),
      net: sum(entries.map((e) => e.net)),
      employerCost: sum(entries.map((e) => e.employerCost)),
    };

    return { summary, byPeriod, byEmployee, entries };
  }

  /** Approve → post the accrual journal (expense + payables). */
  async approveRun(facilityId: string, id: string, userId?: string): Promise<PayrollRun> {
    const run = await this.getRun(facilityId, id);
    if (run.status !== 'draft') throw new BadRequestException(`Run is already ${run.status}`);

    const slips = run.payslips ?? [];
    const journalId = await this.posting.onPayrollAccrued({
      facilityId,
      runId: run.id,
      runNo: run.runNo,
      date: run.payDate ?? today(),
      gross: Number(run.totalGross),
      paye: Number(run.totalPaye),
      wht: sum(slips.map((s) => s.wht)),
      nssfTotal: sum(slips.map((s) => Number(s.nssfEmployee) + Number(s.nssfEmployer))),
      shif: sum(slips.map((s) => s.shif)),
      housingTotal: sum(slips.map((s) => Number(s.housingEmployee) + Number(s.housingEmployer))),
      otherDeductions: sum(slips.map((s) => sum((s.otherDeductions ?? []).map((d) => d.amount)))),
      net: Number(run.totalNet),
      employerCost: Number(run.totalEmployerCost),
    });

    run.status = 'approved';
    run.accrualJournalId = journalId;
    return this.runs.save(run);
  }

  /** Pay → post the disbursement journal (Dr Salaries Payable, Cr Bank). */
  async payRun(facilityId: string, id: string, bankAccountCode?: string, userId?: string): Promise<PayrollRun> {
    const run = await this.getRun(facilityId, id);
    if (run.status === 'draft') throw new BadRequestException('Approve the run before paying it');
    if (run.status === 'paid') throw new BadRequestException('Run is already paid');

    const journalId = await this.posting.onPayrollPaid({
      facilityId,
      runId: run.id,
      runNo: run.runNo,
      date: run.payDate ?? today(),
      net: Number(run.totalNet),
      bankAccountCode: bankAccountCode ?? run.bankAccountCode,
    });

    run.status = 'paid';
    run.paymentJournalId = journalId;
    if (bankAccountCode) run.bankAccountCode = bankAccountCode;
    return this.runs.save(run);
  }
}
