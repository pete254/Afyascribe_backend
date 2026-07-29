import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Payslip } from './payslip.entity';

export type PayrollStatus = 'draft' | 'approved' | 'paid';

/**
 * A payroll run for one pay period. Moves draft → approved (accrual journal:
 * expense + statutory payables + net salaries payable) → paid (disbursement
 * journal: Dr Salaries Payable, Cr Bank).
 */
@Entity('payroll_runs')
@Index(['facilityId', 'periodMonth'])
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'run_no', type: 'varchar', length: 30 })
  runNo: string;

  /** Pay period as YYYY-MM. */
  @Column({ name: 'period_month', type: 'varchar', length: 7 })
  periodMonth: string;

  @Column({ name: 'pay_date', type: 'date', nullable: true })
  payDate: string | null;

  /** COA bank/cash account net pay is disbursed from. */
  @Column({ name: 'bank_account_code', type: 'varchar', length: 20, default: '11003' })
  bankAccountCode: string;

  @Column({ type: 'varchar', length: 10, default: 'draft' })
  status: PayrollStatus;

  @Column({ name: 'total_gross', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalGross: string;

  @Column({ name: 'total_paye', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalPaye: string;

  @Column({ name: 'total_statutory', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalStatutory: string;

  @Column({ name: 'total_net', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalNet: string;

  @Column({ name: 'total_employer_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalEmployerCost: string;

  @Column({ name: 'accrual_journal_id', type: 'uuid', nullable: true })
  accrualJournalId: string | null;

  @Column({ name: 'payment_journal_id', type: 'uuid', nullable: true })
  paymentJournalId: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => Payslip, (p) => p.payrollRun, { cascade: true })
  payslips: Payslip[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
