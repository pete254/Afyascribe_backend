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

      const s = computeStatutory(gross, this.configFor(settings, emp));
      const otherTotal = sum(otherDeds.map((d) => d.amount));
      const totalDeductions = r2(s.paye + s.nssfEmployee + s.shif + s.housingEmployee + otherTotal);
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
      slips.map((s) => Number(s.paye) + Number(s.nssfEmployee) + Number(s.shif) + Number(s.housingEmployee)),
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
