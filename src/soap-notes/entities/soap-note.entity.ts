// src/soap-notes/entities/soap-note.entity.ts
// UPDATED: Added facilityId for facility-scoped data isolation
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { Facility } from '../../facilities/entities/facility.entity';

@Entity('soap_notes')
export class SoapNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Facility Scope ─────────────────────────────────────────────────────────
  // nullable: true during migration — backfill then enforce NOT NULL
  @Column({ nullable: true, type: 'uuid' })
  facilityId: string | null;

  @ManyToOne(() => Facility, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'facilityId' })
  facility: Facility;

  // ── Patient ────────────────────────────────────────────────────────────────
  @ManyToOne(() => Patient, (patient) => patient.soapNotes, { nullable: false, eager: true })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  // ── SOAP Content ───────────────────────────────────────────────────────────
  @Column('text')
  symptoms: string;

  @Column('text')
  physicalExamination: string;

  @Column('text')
  diagnosis: string;

  @Column('text')
  management: string;

  @Column({ type: 'text', nullable: true, name: 'lab_investigations' })
  labInvestigations: string;

  @Column({ type: 'text', nullable: true, name: 'imaging' })
  imaging: string;

  @Column({ length: 10, nullable: true, name: 'icd10_code' })
  icd10Code: string;

  @Column({ length: 200, nullable: true, name: 'icd10_description' })
  icd10Description: string;

  // ── Status ─────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: ['pending', 'submitted', 'reviewed', 'archived'],
    default: 'pending',
  })
  status: string;

  @Column({ default: false })
  wasEdited: boolean;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  // ── Creator ────────────────────────────────────────────────────────────────
  @ManyToOne(() => User, (user) => user.soapNotes, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;

  // ── Edit History ───────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  editHistory: {
    editedBy: string;
    editedByName: string;
    editedAt: Date;
    changes: { field: string; oldValue: string; newValue: string }[];
  }[];

  @Column({ nullable: true })
  lastEditedBy: string;

  @Column({ nullable: true })
  lastEditedByName: string;

  @Column({ type: 'timestamp', nullable: true })
  lastEditedAt: Date;
}