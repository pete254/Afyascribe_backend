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
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: FacilityType, default: FacilityType.HOSPITAL })
  type: FacilityType;

  @Column({ type: 'enum', enum: FacilityStatus, default: FacilityStatus.ACTIVE })
  status: FacilityStatus;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  county: string;

  @Column({ name: 'sub_county', nullable: true })  // ✅ fixed
  subCounty: string;

  @Column({ name: 'license_number', nullable: true, length: 100 })  // ✅ fixed
  licenseNumber: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'logo_public_id', nullable: true })
  logoPublicId: string;

  @Column({ name: 'is_active', default: true })  // ✅ fixed
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })  // ✅ fixed
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })  // ✅ fixed
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.facility)
  users: User[];

  @OneToMany(() => Patient, (patient) => patient.facility)
  patients: Patient[];
}