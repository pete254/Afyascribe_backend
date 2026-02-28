// src/facilities/entities/facility-invite-code.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Facility } from './facility.entity';
import { User } from '../../users/entities/user.entity';

@Entity('facility_invite_codes')
export class FacilityInviteCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── The 8-character alphanumeric code staff enter when signing up ──────────
  @Column({ unique: true, length: 8 })
  code: string;

  // ── Which facility this code belongs to ───────────────────────────────────
  @Column({ type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── Who generated this code ───────────────────────────────────────────────
  @Column({ type: 'uuid' })
  generatedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'generatedById' })
  generatedBy: User;

  // ── Expiry: 30 days by default, manually regeneratable ────────────────────
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  // ── Usage tracking ─────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  usageCount: number;

  // Whether this code is still active (regenerating invalidates the old one)
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}