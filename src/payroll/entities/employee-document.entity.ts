import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** What kind of employee document this is. */
export enum EmployeeDocumentCategory {
  QUALIFICATION = 'qualification',
  CERTIFICATE = 'certificate',
  APPLICATION_LETTER = 'application_letter',
  CONTRACT = 'contract',
  ID = 'id',
  OTHER = 'other',
}

/**
 * A file on an employee's HR profile — qualifications, certificates,
 * application letters, contracts. Stored on Cloudinary; this row holds the
 * metadata and the secure URL.
 */
@Entity('employee_documents')
@Index(['facilityId', 'employeeId'])
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'uploaded_by_id', type: 'uuid', nullable: true })
  uploadedById: string | null;

  @Column({ name: 'document_name', type: 'varchar', length: 500 })
  documentName: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: EmployeeDocumentCategory.OTHER,
  })
  category: EmployeeDocumentCategory;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Where the file is on this server's disk (src/files/file-store.ts). */
  @Column({ name: 'storage_key', type: 'varchar', length: 255, nullable: true })
  storageKey: string | null;

  /** As on PatientDocument: a signed link in responses; the old Cloudinary address until moved. */
  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  /** Cloudinary's id for a file not yet moved; null otherwise. */
  @Column({ name: 'public_id', type: 'varchar', length: 255, nullable: true })
  publicId: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'file_type', type: 'varchar', length: 50 })
  fileType: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
