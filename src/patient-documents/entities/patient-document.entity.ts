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
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';

export enum DocumentCategory {
  LAB_RESULT     = 'lab_result',
  RADIOLOGY      = 'radiology',
  REFERRAL       = 'referral',
  INSURANCE      = 'insurance',
  PRESCRIPTION   = 'prescription',
  IDENTIFICATION = 'identification',
  OTHER          = 'other',
}

export enum DocumentScope {
  PATIENT   = 'patient',    // permanent patient-level
  SOAP_NOTE = 'soap_note',  // tied to a specific SOAP note
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

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  // ── SOAP note (nullable — only for scope = soap_note) ──────────────────────
  @Column({ name: 'soap_note_id', type: 'uuid', nullable: true })
  soapNoteId: string | null;

  @ManyToOne(() => SoapNote, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'soap_note_id' })
  soapNote: SoapNote | null;

  // ── Uploader ───────────────────────────────────────────────────────────────
  @Column({ name: 'uploaded_by_id', type: 'uuid', nullable: true })
  uploadedById: string | null;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User | null;

  // ── Scope & classification ─────────────────────────────────────────────────
  @Column({
    name: 'scope',
    type: 'enum',
    enum: DocumentScope,
    enumName: 'document_scope_enum',
    default: DocumentScope.PATIENT,
  })
  scope: DocumentScope;

  @Column({ name: 'document_name', type: 'varchar', length: 500 })
  documentName: string; // custom name e.g. "Chest X-Ray Jan 2025"

  @Column({
    name: 'category',
    type: 'enum',
    enum: DocumentCategory,
    enumName: 'document_category_enum',
    default: DocumentCategory.OTHER,
  })
  category: DocumentCategory;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ── Cloudinary / file details ──────────────────────────────────────────────
  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'public_id', type: 'varchar', length: 255 })
  publicId: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string; // original filename from device

  @Column({ name: 'file_type', type: 'varchar', length: 50 })
  fileType: string; // mime type

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  // ── Timestamp ──────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}