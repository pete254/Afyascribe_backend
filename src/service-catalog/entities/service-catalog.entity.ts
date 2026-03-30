// src/service-catalog/entities/service-catalog.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Facility } from '../../facilities/entities/facility.entity';

export enum ServiceCategory {
  CONSULTATION    = 'consultation',
  LAB             = 'lab',
  IMAGING         = 'imaging',
  PROCEDURE       = 'procedure',
  PHARMACY        = 'pharmacy',
  NURSING         = 'nursing',
  THEATRE         = 'theatre',
  PHYSIOTHERAPY   = 'physiotherapy',
  OTHER           = 'other',
}

@Entity('service_catalog')
export class ServiceCatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @ManyToOne(() => Facility, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facility_id' })
  facility: Facility;

  @Column({ name: 'name', length: 200 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'category',
    type: 'enum',
    enum: ServiceCategory,
    default: ServiceCategory.CONSULTATION,
  })
  category: ServiceCategory;

  @Column({
    name: 'default_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  defaultPrice: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}