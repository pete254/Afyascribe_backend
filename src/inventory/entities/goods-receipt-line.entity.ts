import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GoodsReceipt } from './goods-receipt.entity';

@Entity('goods_receipt_lines')
export class GoodsReceiptLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'goods_receipt_id', type: 'uuid' })
  goodsReceiptId: string;

  @ManyToOne(() => GoodsReceipt, (g) => g.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_receipt_id' })
  goodsReceipt: GoodsReceipt;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 14, scale: 4 })
  unitCost: string;

  @Column({ name: 'line_value', type: 'numeric', precision: 14, scale: 2 })
  lineValue: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 60, nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;
}
