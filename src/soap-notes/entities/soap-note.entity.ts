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

  // Patient Reference - CHANGED: Now links to Patient entity
  @ManyToOne(() => Patient, (patient) => patient.soapNotes, { nullable: false, eager: true })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column()
  patientId: string;

  // SOAP Note Content - Four sections (Hospital's field names)
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

  // Relationship to User (who created the note)
  @ManyToOne(() => User, (user) => user.soapNotes, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;
}