// src/patient-documents/entities/patient-document.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';

export enum DocumentCategory {
  LAB_RESULT = 'lab_result',
  RADIOLOGY = 'radiology',
  REFERRAL = 'referral',
  INSURANCE = 'insurance',
  PRESCRIPTION = 'prescription',
  OTHER = 'other',
}

@Entity('patient_documents')
export class PatientDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Facility scope ─────────────────────────────────────────────────────────
  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  // ── Patient ────────────────────────────────────────────────────────────────
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  // ── Uploader ───────────────────────────────────────────────────────────────
  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User;

  // ── File details ───────────────────────────────────────────────────────────
  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'public_id', type: 'varchar', length: 255 })
  publicId: string; // Cloudinary public_id for deletion

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'file_type', type: 'varchar', length: 50 })
  fileType: string; // 'image/jpeg', 'image/png', 'application/pdf'

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null; // bytes

  @Column({
    name: 'category',
    type: 'enum',
    enum: DocumentCategory,
    enumName: 'document_category_enum',
    default: DocumentCategory.OTHER,
  })
  category: DocumentCategory;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null; // Optional description/notes about this document

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}