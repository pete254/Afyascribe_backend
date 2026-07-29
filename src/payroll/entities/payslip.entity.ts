import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PayrollRun } from './payroll-run.entity';

/** A named money component (allowance or deduction) captured on a payslip. */
export interface PayComponent {
  name: string;
  amount: number;
}

/**
 * One employee's pay for one run. Statutory figures are computed from gross
 * (basic + allowances) at build time and frozen here for audit.
 */
@Entity('payslips')
@Index(['facilityId', 'employeeId'])
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payroll_run_id', type: 'uuid' })
  payrollRunId: string;

  @ManyToOne(() => PayrollRun, (r) => r.payslips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_run_id' })
  payrollRun: PayrollRun;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'employee_name' })
  employeeName: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  basic: string;

  @Column({ type: 'jsonb', nullable: true })
  allowances: PayComponent[] | null;

  @Column({ name: 'gross_pay', type: 'numeric', precision: 14, scale: 2, default: 0 })
  grossPay: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  paye: string;

  @Column({ name: 'nssf_employee', type: 'numeric', precision: 14, scale: 2, default: 0 })
  nssfEmployee: string;

  @Column({ name: 'nssf_employer', type: 'numeric', precision: 14, scale: 2, default: 0 })
  nssfEmployer: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  shif: string;

  @Column({ name: 'housing_employee', type: 'numeric', precision: 14, scale: 2, default: 0 })
  housingEmployee: string;

  @Column({ name: 'housing_employer', type: 'numeric', precision: 14, scale: 2, default: 0 })
  housingEmployer: string;

  @Column({ name: 'other_deductions', type: 'jsonb', nullable: true })
  otherDeductions: PayComponent[] | null;

  @Column({ name: 'total_deductions', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalDeductions: string;

  @Column({ name: 'net_pay', type: 'numeric', precision: 14, scale: 2, default: 0 })
  netPay: string;
}
