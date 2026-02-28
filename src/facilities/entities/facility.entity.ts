// src/facilities/entities/facility.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Patient } from '../../patients/entities/patient.entity';

export enum FacilityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum FacilityType {
  HOSPITAL = 'hospital',
  CLINIC = 'clinic',
  HEALTH_CENTRE = 'health_centre',
  DISPENSARY = 'dispensary',
}

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 10 })
  code: string; // e.g. "KNH", "AAR", "KIJABE" — used in patient IDs

  @Column({ length: 200 })
  name: string; // e.g. "Kenyatta National Hospital"

  @Column({
    type: 'enum',
    enum: FacilityType,
    default: FacilityType.HOSPITAL,
  })
  type: FacilityType;

  @Column({
    type: 'enum',
    enum: FacilityStatus,
    default: FacilityStatus.ACTIVE,
  })
  status: FacilityStatus;

  // Contact
  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  subCounty: string;

  // License / Registration
  @Column({ nullable: true, length: 100 })
  licenseNumber: string;

  // Metadata
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => User, (user) => user.facility)
  users: User[];

  @OneToMany(() => Patient, (patient) => patient.facility)
  patients: Patient[];
}