import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderLine } from './entities/purchase-order-line.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { SupplierInvoiceService } from './supplier-invoice.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateGoodsReceiptDto,
  CreateSupplierPaymentDto,
} from './dto/inventory.dto';
import { StockService } from './stock.service';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);
const priceFromMarkup = (cost: number, markupPct: number) => r2(cost * (1 + markupPct / 100));

/**
 * Category → GL account mapping for stock items auto-created when goods are
 * received against an order (procurement-only facilities). Mirrors the web's
 * ITEM_CATEGORIES so a drug, reagent or consumable lands in the right
 * inventory / COGS / revenue accounts without anyone touching account codes.
 */
const CATEGORY_ACCOUNTS: Record<string, { inventory: string; cogs: string; revenue: string }> = {
  drug: { inventory: '13001', cogs: '51001', revenue: '42001' },
  reagent: { inventory: '13002', cogs: '51003', revenue: '43001' },
  consumable: { inventory: '13003', cogs: '51002', revenue: '41004' },
  surgical: { inventory: '13004', cogs: '51005', revenue: '45001' },
  vaccine: { inventory: '13007', cogs: '51006', revenue: '41004' },
  radiology: { inventory: '13005', cogs: '51007', revenue: '44001' },
  other: { inventory: '13003', cogs: '51002', revenue: '41004' },
};
const accountsFor = (category?: string | null) =>
  CATEGORY_ACCOUNTS[category ?? 'drug'] ?? CATEGORY_ACCOUNTS.drug;

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
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrders: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly purchaseOrderLines: Repository<PurchaseOrderLine>,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
    private readonly stock: StockService,
    private readonly posting: HmisPostingService,
    private readonly supplierInvoices: SupplierInvoiceService,
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
      physicalAddress: dto.physicalAddress ?? null,
      postalAddress: dto.postalAddress ?? null,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      bankBranch: dto.bankBranch ?? null,
      payableAccountCode: dto.payableAccountCode ?? '21001',
    });
    return this.suppliers.save(supplier);
  }

  listSuppliers(facilityId: string): Promise<Supplier[]> {
    return this.suppliers.find({ where: { facilityId }, order: { name: 'ASC' } });
  }

  /**
   * A supplier account statement: every goods receipt (what they sold us —
   * increases what we owe) and every payment (reduces it), in date order, with a
   * running balance. `from` sets an opening balance from everything before it.
   */
  async supplierStatement(
    facilityId: string,
    id: string,
    range: { from?: string; to?: string } = {},
  ) {
    const supplier = await this.getSupplier(facilityId, id);

    const grns = await this.grns.find({ where: { facilityId, supplierId: id } });
    const pays = await this.payments.find({ where: { facilityId, supplierId: id } });

    type Row = {
      date: string;
      type: 'goods' | 'payment';
      ref: string;
      description: string;
      received: number; // increases what we owe
      paid: number; // reduces it
    };

    const rows: Row[] = [
      ...grns.map((g) => ({
        date: g.date,
        type: 'goods' as const,
        ref: g.grnNo,
        description: g.reference ? `Goods received · ${g.reference}` : 'Goods received',
        received: Number(g.totalValue),
        paid: 0,
      })),
      ...pays.map((p) => ({
        date: p.date,
        type: 'payment' as const,
        ref: p.paymentNo,
        description: `Payment (${p.method})${p.reference ? ` · ${p.reference}` : ''}`,
        received: 0,
        paid: Number(p.amount),
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === 'goods' ? -1 : 1));

    const from = range.from || null;
    const to = range.to || null;

    // Opening balance = net of everything strictly before `from`.
    let opening = 0;
    for (const r of rows) {
      if (from && r.date < from) opening = r2(opening + r.received - r.paid);
    }

    const inWindow = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));

    let balance = opening;
    const transactions = inWindow.map((r) => {
      balance = r2(balance + r.received - r.paid);
      return { ...r, balance };
    });

    const totalReceived = r2(inWindow.reduce((s, r) => s + r.received, 0));
    const totalPaid = r2(inWindow.reduce((s, r) => s + r.paid, 0));

    return {
      supplier,
      from,
      to,
      openingBalance: opening,
      transactions,
      totals: {
        received: totalReceived,
        paid: totalPaid,
        // The live payable owed, from the supplier's running balance.
        balance: Number(supplier.balance),
      },
    };
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
    for (const line of dto.lines) {
      if (line.quantity <= 0) throw new BadRequestException('Line quantity must be greater than 0');
      if (!line.itemId && !(line.name && line.name.trim())) {
        throw new BadRequestException('Each received line needs an existing item or a name');
      }
    }

    // Default markup for any item born on this receipt, so its shelf price is set.
    const facility = await this.facilities.findOne({ where: { id: facilityId } });
    const defaultMarkup = Number(facility?.defaultMarkupPct ?? 0) || 0;

    const date = dto.date ?? today();
    // LPO lines we touched, so we can recompute the order's receipt status after.
    const touchedPoIds = new Set<string>(dto.purchaseOrderId ? [dto.purchaseOrderId] : []);

    const { grn, postingLines } = await this.dataSource.transaction(async (mgr) => {
      const itemRepo = mgr.getRepository(InventoryItem);
      const count = await mgr.getRepository(GoodsReceipt).count({ where: { facilityId } });
      const grnNo = `GRN-${String(count + 1).padStart(6, '0')}`;

      const header = await mgr.getRepository(GoodsReceipt).save(
        mgr.getRepository(GoodsReceipt).create({
          facilityId,
          grnNo,
          supplierId: supplier.id,
          purchaseOrderId: dto.purchaseOrderId ?? null,
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
        // Resolve the line to a stock item: use the given one, match an existing
        // item by name, or create it (procurement-only facilities never pre-add).
        let item: InventoryItem | null = null;
        if (line.itemId) {
          item = await itemRepo.findOne({ where: { id: line.itemId, facilityId } });
          if (!item) throw new BadRequestException(`Unknown item ${line.itemId}`);
        } else {
          const name = line.name!.trim();
          item = await itemRepo
            .createQueryBuilder('i')
            .where('i.facilityId = :facilityId', { facilityId })
            .andWhere('LOWER(i.name) = LOWER(:name)', { name })
            .getOne();
          if (!item) {
            const acc = accountsFor(line.category);
            const sale = defaultMarkup > 0 ? priceFromMarkup(line.unitCost, defaultMarkup) : 0;
            item = await itemRepo.save(
              itemRepo.create({
                facilityId,
                name,
                category: line.category ?? 'drug',
                unit: line.unit ?? 'unit',
                costPrice: line.unitCost.toFixed(2),
                salePrice: sale.toFixed(2),
                markupPct: defaultMarkup > 0 ? defaultMarkup.toFixed(2) : null,
                inventoryAccountCode: acc.inventory,
                cogsAccountCode: acc.cogs,
                revenueAccountCode: acc.revenue,
              }),
            );
          }
        }

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

        // Track this lot for FEFO / expiry.
        await this.stock.createBatch(mgr, {
          facilityId,
          itemId: item.id,
          batchNo: line.batchNo ?? null,
          expiryDate: line.expiryDate ?? null,
          quantity: line.quantity,
          unitCost: line.unitCost,
          date,
          sourceType: 'goods_receipt',
          sourceId: header.id,
        });

        await mgr.getRepository(GoodsReceiptLine).save(
          mgr.getRepository(GoodsReceiptLine).create({
            goodsReceiptId: header.id,
            itemId: item.id,
            quantity: line.quantity.toFixed(3),
            unitCost: line.unitCost.toFixed(4),
            lineValue: lineValue.toFixed(2),
            batchNo: line.batchNo ?? null,
            expiryDate: line.expiryDate ?? null,
          }),
        );

        // Accumulate the received quantity on the ordered line (partial receipts).
        if (line.purchaseOrderLineId) {
          const poLine = await mgr.getRepository(PurchaseOrderLine).findOne({
            where: { id: line.purchaseOrderLineId },
          });
          if (poLine) {
            const ordered = Number(poLine.quantity);
            const already = Number(poLine.receivedQty);
            poLine.receivedQty = r3(Math.min(ordered, already + line.quantity)).toFixed(3);
            await mgr.getRepository(PurchaseOrderLine).save(poLine);
            touchedPoIds.add(poLine.purchaseOrderId);
          }
        }

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

      // Recompute the receipt status of every LPO this receipt touched: fully
      // received when every line is met, otherwise partially received.
      for (const poId of touchedPoIds) {
        const po = await mgr
          .getRepository(PurchaseOrder)
          .findOne({ where: { id: poId, facilityId }, relations: ['lines'] });
        if (!po || po.status === 'cancelled' || po.status === 'rejected') continue;
        const lines = po.lines ?? [];
        const fully =
          lines.length > 0 && lines.every((l) => Number(l.receivedQty) >= Number(l.quantity) - 0.0005);
        po.status = fully ? 'received' : 'partially_received';
        po.goodsReceiptId = header.id;
        await mgr.getRepository(PurchaseOrder).save(po);
      }

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
          supplierInvoiceId: dto.supplierInvoiceId ?? null,
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

    // Track how much of the linked invoice this settles.
    if (dto.supplierInvoiceId) {
      await this.supplierInvoices.applyPayment(facilityId, dto.supplierInvoiceId, dto.amount);
    }

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
