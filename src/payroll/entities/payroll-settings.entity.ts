import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PayeBand } from '../data/statutory';

/**
 * Per-facility payroll configuration — which statutory deductions apply and at
 * what rates. One row per facility; seeded from the statutory defaults and then
 * editable so each facility can set up its own payroll (e.g. switch off the
 * housing levy, or adjust a rate when the law changes).
 */
@Entity('payroll_settings')
@Index(['facilityId'], { unique: true })
export class PayrollSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  // Master switches — turn a whole statutory item off for the facility.
  @Column({ name: 'paye_enabled', type: 'boolean', default: true })
  payeEnabled: boolean;

  @Column({ name: 'nssf_enabled', type: 'boolean', default: true })
  nssfEnabled: boolean;

  @Column({ name: 'shif_enabled', type: 'boolean', default: true })
  shifEnabled: boolean;

  @Column({ name: 'housing_enabled', type: 'boolean', default: true })
  housingEnabled: boolean;

  // Rates.
  @Column({ name: 'nssf_rate', type: 'numeric', precision: 8, scale: 5, default: 0.06 })
  nssfRate: string;

  @Column({ name: 'nssf_upper_limit', type: 'numeric', precision: 14, scale: 2, default: 72000 })
  nssfUpperLimit: string;

  @Column({ name: 'shif_rate', type: 'numeric', precision: 8, scale: 5, default: 0.0275 })
  shifRate: string;

  @Column({ name: 'shif_min', type: 'numeric', precision: 14, scale: 2, default: 300 })
  shifMin: string;

  @Column({ name: 'housing_rate', type: 'numeric', precision: 8, scale: 5, default: 0.015 })
  housingRate: string;

  @Column({ name: 'personal_relief', type: 'numeric', precision: 14, scale: 2, default: 2400 })
  personalRelief: string;

  @Column({ name: 'paye_bands', type: 'jsonb', nullable: true })
  payeBands: PayeBand[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
