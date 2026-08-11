import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Prescription } from './prescription.entity';

/**
 * One medication line on a prescription. The clinical fields (medication, dosage,
 * frequency, duration, quantity, instructions) are written by the doctor. The
 * pharmacy fields (itemId, dispenseQty, unitPrice, billingId, dispensed) are
 * filled in by the pharmacist when the line is linked to stock, priced, billed
 * and finally handed over.
 */
@Entity('prescription_items')
export class PrescriptionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id', type: 'uuid' })
  prescriptionId: string;

  @ManyToOne(() => Prescription, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  // ── Clinical (doctor) ──────────────────────────────────────────────────────
  @Column()
  medication: string;

  @Column({ type: 'varchar', nullable: true })
  dosage: string | null;

  @Column({ type: 'varchar', nullable: true })
  frequency: string | null;

  @Column({ type: 'varchar', nullable: true })
  duration: string | null;

  /** The doctor's free-text quantity, e.g. "21 tabs". */
  @Column({ name: 'quantity_text', type: 'varchar', nullable: true })
  quantityText: string | null;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  // ── Pharmacy (dispensing) ──────────────────────────────────────────────────
  /** Linked inventory item — set when the pharmacist maps the drug to stock. */
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  /** Quantity to dispense/deplete from stock (numeric units). */
  @Column({ name: 'dispense_qty', type: 'numeric', precision: 14, scale: 3, nullable: true })
  dispenseQty: string | null;

  /** Sale price per unit at the time of dispensing. */
  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  unitPrice: string | null;

  /** The bill raised for this line, once sent to billing. */
  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId: string | null;

  @Column({ type: 'boolean', default: false })
  dispensed: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
