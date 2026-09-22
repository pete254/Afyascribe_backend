import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { InventoryItem } from './inventory-item.entity';

export type ControlledEntryType = 'receipt' | 'dispense' | 'adjustment' | 'destruction' | 'return';

/**
 * The controlled drugs register (the "DDA book") required for narcotics and
 * psychotropics under the Narcotic Drugs and Psychotropic Substances (Control)
 * Act, Cap 245. One append-only row per movement of a controlled item, with a
 * running balance, who it went to, who prescribed it, who handed it over and
 * who witnessed — the columns a PPB inspector reads.
 *
 * Rows are written automatically whenever controlled stock moves; they are
 * never edited or deleted (a correction is a new entry).
 */
@Entity('controlled_drug_register')
@Index(['facilityId', 'itemId', 'date'])
export class ControlledDrugRegisterEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'facility_id', type: 'uuid' })
  facilityId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: InventoryItem;

  /** Snapshotted so the register reads correctly even if the item is renamed. */
  @Column({ name: 'item_name', type: 'varchar', length: 200 })
  itemName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  schedule: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  type: ControlledEntryType;

  @Column({ name: 'qty_in', type: 'numeric', precision: 14, scale: 3, default: 0 })
  qtyIn: string;

  @Column({ name: 'qty_out', type: 'numeric', precision: 14, scale: 3, default: 0 })
  qtyOut: string;

  /** Stock on hand after this entry — the register's running balance. */
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0 })
  balance: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 60, nullable: true })
  batchNo: string | null;

  // ── Who it concerns ────────────────────────────────────────────────────────
  @Column({ name: 'patient_name', type: 'varchar', length: 200, nullable: true })
  patientName: string | null;

  @Column({ name: 'patient_no', type: 'varchar', length: 60, nullable: true })
  patientNo: string | null;

  /** Prescriber (name + registration no. where known). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  prescriber: string | null;

  @Column({ name: 'prescription_no', type: 'varchar', length: 60, nullable: true })
  prescriptionNo: string | null;

  // ── Who handled it ─────────────────────────────────────────────────────────
  @Column({ name: 'handled_by_id', type: 'uuid', nullable: true })
  handledById: string | null;

  @Column({ name: 'handled_by_name', type: 'varchar', length: 200, nullable: true })
  handledByName: string | null;

  /** Second signature — required for destruction, advisable on dispensing. */
  @Column({ name: 'witness_name', type: 'varchar', length: 200, nullable: true })
  witnessName: string | null;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** The stock movement this entry mirrors. */
  @Column({ name: 'movement_id', type: 'uuid', nullable: true })
  movementId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
