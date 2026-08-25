import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Facility } from '../../facilities/entities/facility.entity';

@Entity('insurance_schemes')
export class InsuranceScheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  @Column({ name: 'name', length: 200 })
  name: string;

  @Column({ name: 'code', length: 20 })
  code: string;

  // A payer is either an insurer (medical scheme) or a corporate/employer client
  // billed on account. Both bill on account the same way; the type only splits
  // them into their own AR ledgers and GL control accounts.
  @Column({ name: 'payer_type', type: 'varchar', length: 20, default: 'insurer' })
  payerType: 'insurer' | 'corporate';

  @Column({ name: 'contact_email', length: 200, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}