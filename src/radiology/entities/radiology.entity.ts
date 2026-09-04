import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Facility } from '../../facilities/entities/facility.entity';
import { RadiologyType } from '../radiology-type.enum';
import { RadiologyStatus } from '../radiology-status.enum';

@Entity()
export class Radiology {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RadiologyType })
  type: RadiologyType;

  @ManyToOne(() => Patient, { eager: true })
  patient: Patient;

  @ManyToOne(() => Facility, { eager: true })
  facility: Facility;

  @ManyToOne(() => User, { nullable: true, eager: true })
  requestedBy?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  performedBy?: User;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'enum', enum: RadiologyStatus, default: RadiologyStatus.REQUESTED })
  status: RadiologyStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  report?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
