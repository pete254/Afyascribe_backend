import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('soap_notes')
export class SoapNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Patient Information
  @Column()
  patientName: string;

  @Column({ nullable: true })
  patientAge: number;

  @Column({ nullable: true })
  patientGender: string;

  // Note Content
  @Column('text')
  originalTranscription: string;

  @Column('text')
  formattedSoapNotes: string;

  @Column('simple-array', { nullable: true })
  medicalTermsFound: string[];

  // Metadata
  @Column({ type: 'enum', enum: ['pending', 'submitted', 'reviewed', 'archived'], default: 'pending' })
  status: string;

  @Column({ nullable: true })
  transcriptionMethod: string;

  @Column({ type: 'float', nullable: true })
  confidence: number;

  @Column({ type: 'int', nullable: true })
  processingTime: number;

  @Column({ default: false })
  wasEdited: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  submittedAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.soapNotes, { nullable: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;
}