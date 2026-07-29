import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateGoodsReceiptDto,
  CreateSupplierPaymentDto,
} from './dto/inventory.dto';
import { StockService } from './stock.service';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ProcurementService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
    @InjectRepository(GoodsReceipt)
    private readonly grns: Repository<GoodsReceipt>,
    @InjectRepository(SupplierPayment)
    private readonly payments: Repository<SupplierPayment>,
    private readonly stock: StockService,
    private readonly posting: HmisPostingService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Suppliers ────────────────────────────────────────────────────────────────

  createSupplier(facilityId: string, dto: CreateSupplierDto): Promise<Supplier> {
    const supplier = this.suppliers.create({
      facilityId,
      name: dto.name.trim(),
      contactPerson: dto.contactPerson ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      taxPin: dto.taxPin ?? null,
      payableAccountCode: dto.payableAccountCode ?? '21001',
    });
    return this.suppliers.save(supplier);
  }

  listSuppliers(facilityId: string): Promise<Supplier[]> {
    return this.suppliers.find({ where: { facilityId }, order: { name: 'ASC' } });
  }

  async getSupplier(facilityId: string, id: string): Promise<Supplier> {
    const s = await this.suppliers.findOne({ where: { id, facilityId } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async updateSupplier(facilityId: string, id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const s = await this.getSupplier(facilityId, id);
    Object.assign(s, dto);
    return this.suppliers.save(s);
  }

  // ── Goods receipt (Dr Inventory, Cr Accounts Payable) ─────────────────────────

  async receiveGoods(
    facilityId: string,
    dto: CreateGoodsReceiptDto,
    userId?: string,
  ): Promise<GoodsReceipt> {
    const supplier = await this.getSupplier(facilityId, dto.supplierId);

    // Validate every line item exists for this facility.
    const itemIds = dto.lines.map((l) => l.itemId);
    const items = await this.items.find({
      where: itemIds.map((id) => ({ id, facilityId })),
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const line of dto.lines) {
      if (!byId.has(line.itemId)) throw new BadRequestException(`Unknown item ${line.itemId}`);
      if (line.quantity <= 0) throw new BadRequestException('Line quantity must be greater than 0');
    }

    const date = dto.date ?? today();

    const { grn, postingLines } = await this.dataSource.transaction(async (mgr) => {
      const count = await mgr.getRepository(GoodsReceipt).count({ where: { facilityId } });
      const grnNo = `GRN-${String(count + 1).padStart(6, '0')}`;

      const header = await mgr.getRepository(GoodsReceipt).save(
        mgr.getRepository(GoodsReceipt).create({
          facilityId,
          grnNo,
          supplierId: supplier.id,
          date,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          totalValue: '0',
          createdById: userId ?? null,
        }),
      );

      let total = 0;
      const postingLines: { inventoryAccountCode: string; value: number; description?: string }[] = [];

      for (const line of dto.lines) {
        const item = byId.get(line.itemId)!;
        const lineValue = r2(line.quantity * line.unitCost);
        total = r2(total + lineValue);

        await this.stock.recordMovement(mgr, item, {
          type: 'receipt',
          quantity: line.quantity,
          unitCost: line.unitCost,
          date,
          reference: grnNo,
          sourceType: 'goods_receipt',
          sourceId: header.id,
          userId,
        });

        await mgr.getRepository(GoodsReceiptLine).save(
          mgr.getRepository(GoodsReceiptLine).create({
            goodsReceiptId: header.id,
            itemId: item.id,
            quantity: line.quantity.toFixed(3),
            unitCost: line.unitCost.toFixed(4),
            lineValue: lineValue.toFixed(2),
          }),
        );

        postingLines.push({
          inventoryAccountCode: item.inventoryAccountCode,
          value: lineValue,
          description: item.name,
        });
      }

      header.totalValue = total.toFixed(2);
      await mgr.getRepository(GoodsReceipt).save(header);

      // Increase what we owe the supplier.
      supplier.balance = r2(Number(supplier.balance) + total).toFixed(2);
      await mgr.getRepository(Supplier).save(supplier);

      return { grn: header, postingLines };
    });

    // Post the journal (best-effort) and record its id.
    const journalId = await this.posting.onGoodsReceived({
      facilityId,
      grnId: grn.id,
      grnNo: grn.grnNo,
      date,
      supplierPayableCode: supplier.payableAccountCode,
      supplierName: supplier.name,
      total: Number(grn.totalValue),
      lines: postingLines,
    });
    if (journalId) await this.grns.update({ id: grn.id }, { journalEntryId: journalId });

    return this.grns.findOne({ where: { id: grn.id }, relations: ['lines'] }) as Promise<GoodsReceipt>;
  }

  listGoodsReceipts(facilityId: string): Promise<GoodsReceipt[]> {
    return this.grns.find({
      where: { facilityId },
      relations: ['lines'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Supplier payment (Dr Accounts Payable, Cr Bank/Cash) ──────────────────────

  async paySupplier(
    facilityId: string,
    dto: CreateSupplierPaymentDto,
    userId?: string,
  ): Promise<SupplierPayment> {
    if (!(dto.amount > 0)) throw new BadRequestException('Payment amount must be greater than 0');
    const supplier = await this.getSupplier(facilityId, dto.supplierId);
    const date = dto.date ?? today();

    const payment = await this.dataSource.transaction(async (mgr) => {
      const count = await mgr.getRepository(SupplierPayment).count({ where: { facilityId } });
      const paymentNo = `SP-${String(count + 1).padStart(6, '0')}`;

      const saved = await mgr.getRepository(SupplierPayment).save(
        mgr.getRepository(SupplierPayment).create({
          facilityId,
          paymentNo,
          supplierId: supplier.id,
          date,
          amount: dto.amount.toFixed(2),
          method: dto.method ?? 'bank',
          bankAccountCode: dto.bankAccountCode ?? '11003',
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          createdById: userId ?? null,
        }),
      );

      supplier.balance = r2(Number(supplier.balance) - dto.amount).toFixed(2);
      await mgr.getRepository(Supplier).save(supplier);
      return saved;
    });

    const journalId = await this.posting.onSupplierPayment({
      facilityId,
      paymentId: payment.id,
      paymentNo: payment.paymentNo,
      date,
      payableCode: supplier.payableAccountCode,
      bankAccountCode: payment.bankAccountCode,
      amount: dto.amount,
      supplierName: supplier.name,
    });
    if (journalId) await this.payments.update({ id: payment.id }, { journalEntryId: journalId });

    return this.payments.findOne({ where: { id: payment.id } }) as Promise<SupplierPayment>;
  }

  listPayments(facilityId: string): Promise<SupplierPayment[]> {
    return this.payments.find({
      where: { facilityId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
