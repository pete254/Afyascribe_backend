// src/soap-notes/entities/soap-note.entity.ts
import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Patient } from '../../patients/entities/patient.entity';

@Entity('soap_notes')
export class SoapNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Patient Reference
  @ManyToOne(() => Patient, (patient) => patient.soapNotes, { nullable: false, eager: true })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  // SOAP Note Content - Four sections
  @Column('text')
  symptoms: string; // Symptoms & Diagnosis section

  @Column('text')
  physicalExamination: string; // Physical Examination section

  @Column('text')
  diagnosis: string; // Diagnosis section

  @Column('text')
  management: string; // Management section

  // Metadata
  @Column({ 
    type: 'enum', 
    enum: ['pending', 'submitted', 'reviewed', 'archived'], 
    default: 'pending' 
  })
  status: string;

  @Column({ default: false })
  wasEdited: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  // Original creator
  @ManyToOne(() => User, (user) => user.soapNotes, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;

  // 🆕 NEW: Edit history tracking
  @Column({ type: 'jsonb', nullable: true })
  editHistory: {
    editedBy: string;        // User ID
    editedByName: string;    // Display name
    editedAt: Date;
    changes: {
      field: string;         // Which field was changed
      oldValue: string;
      newValue: string;
    }[];
  }[];

  // 🆕 NEW: Last editor info (for quick display)
  @Column({ nullable: true })
  lastEditedBy: string;

  @Column({ nullable: true })
  lastEditedByName: string;

  @Column({ type: 'timestamp', nullable: true })
  lastEditedAt: Date;
}