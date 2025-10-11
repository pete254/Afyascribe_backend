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