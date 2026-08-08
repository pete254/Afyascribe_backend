import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabOrderItem } from './lab-order-item.entity';

/** How a value sits against its reference range. */
export type LabFlag = 'normal' | 'high' | 'low' | 'abnormal';

/**
 * One analyte result on an order item — the entered value plus a snapshot of the
 * range it was judged against and the resulting High/Low/Abnormal flag.
 */
@Entity('lab_result_values')
export class LabResultValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId: string;

  @ManyToOne(() => LabOrderItem, (i) => i.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: LabOrderItem;

  @Column({ name: 'analyte_id', type: 'uuid', nullable: true })
  analyteId: string | null;

  @Column({ name: 'analyte_name' })
  analyteName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  unit: string | null;

  @Column({ name: 'ref_low', type: 'numeric', precision: 14, scale: 4, nullable: true })
  refLow: string | null;

  @Column({ name: 'ref_high', type: 'numeric', precision: 14, scale: 4, nullable: true })
  refHigh: string | null;

  @Column({ name: 'ref_text', type: 'varchar', nullable: true })
  refText: string | null;

  @Column({ type: 'varchar', nullable: true })
  value: string | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  flag: LabFlag | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
