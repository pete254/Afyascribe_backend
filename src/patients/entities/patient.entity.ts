// src/patients/entities/patient.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  patientId: string; // Hospital ID like "P-2024-001"

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  middleName: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  occupation: string;

  @Column({ nullable: true })
  idType: string;

  @Column({ nullable: true })
  idNumber: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  subCounty: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ nullable: true })
  howKnown: string;

  @Column({ nullable: true })
  patientType: string;

  @Column({ nullable: true })
  medicalPlan: string;

  @Column({ nullable: true })
  membershipNo: string;

  @Column()
  age: number; // Age from hospital database - no calculation needed

  @Column()
  gender: string; // 'male', 'female', 'other'

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  email: string;

  @CreateDateColumn()
  registeredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastVisit: Date;

  @OneToMany(() => SoapNote, (soapNote) => soapNote.patient)
  soapNotes: SoapNote[];
}