import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A payroll employee. May be linked to a login User (userId) but need not be —
 * cleaners, drivers and other staff are paid without app accounts.
 */
@Entity('employees')
@Index(['facilityId', 'employeeNo'])
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'employee_no', type: 'varchar', length: 30 })
  employeeNo: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'national_id', type: 'varchar', length: 40, nullable: true })
  nationalId: string | null;

  @Column({ name: 'kra_pin', type: 'varchar', length: 40, nullable: true })
  kraPin: string | null;

  @Column({ name: 'nssf_no', type: 'varchar', length: 40, nullable: true })
  nssfNo: string | null;

  @Column({ name: 'shif_no', type: 'varchar', length: 40, nullable: true })
  shifNo: string | null;

  @Column({ name: 'job_title', type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ name: 'basic_salary', type: 'numeric', precision: 14, scale: 2, default: 0 })
  basicSalary: string;

  @Column({ name: 'bank_name', type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account', type: 'varchar', nullable: true })
  bankAccount: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'employment_type', type: 'varchar', length: 30, default: 'permanent' })
  employmentType: string;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  /** Optional link to a login account. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
