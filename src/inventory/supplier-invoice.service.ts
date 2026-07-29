import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { Supplier } from './entities/supplier.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { CreateSupplierInvoiceDto } from './dto/supplier-invoice.dto';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class SupplierInvoiceService {
  constructor(
    @InjectRepository(SupplierInvoice)
    private readonly invoices: Repository<SupplierInvoice>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceipt)
    private readonly grns: Repository<GoodsReceipt>,
  ) {}

  async create(facilityId: string, dto: CreateSupplierInvoiceDto, userId?: string): Promise<SupplierInvoice> {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId, facilityId } });
    if (!supplier) throw new BadRequestException('Unknown supplier');

    const count = await this.invoices.count({ where: { facilityId } });
    const invoice = this.invoices.create({
      facilityId,
      invoiceNo: `INV-${String(count + 1).padStart(6, '0')}`,
      supplierInvoiceNo: dto.supplierInvoiceNo?.trim() || null,
      supplierId: supplier.id,
      purchaseOrderId: dto.purchaseOrderId ?? null,
      goodsReceiptId: dto.goodsReceiptId ?? null,
      date: dto.date ?? today(),
      dueDate: dto.dueDate ?? null,
      total: r2(dto.total).toFixed(2),
      amountPaid: '0',
      status: 'unpaid',
      notes: dto.notes ?? null,
      createdById: userId ?? null,
    });
    return this.invoices.save(invoice);
  }

  list(facilityId: string): Promise<SupplierInvoice[]> {
    return this.invoices.find({ where: { facilityId }, order: { createdAt: 'DESC' }, take: 200 });
  }

  async get(facilityId: string, id: string): Promise<SupplierInvoice> {
    const inv = await this.invoices.findOne({ where: { id, facilityId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /** 3-way match: LPO total vs goods-received total vs invoice total. */
  async matchInfo(facilityId: string, id: string) {
    const invoice = await this.get(facilityId, id);
    const po = invoice.purchaseOrderId
      ? await this.orders.findOne({ where: { id: invoice.purchaseOrderId, facilityId } })
      : null;
    const grn = invoice.goodsReceiptId
      ? await this.grns.findOne({ where: { id: invoice.goodsReceiptId, facilityId } })
      : null;

    const invoiceTotal = Number(invoice.total);
    const poTotal = po ? Number(po.total) : null;
    const grnTotal = grn ? Number(grn.totalValue) : null;
    const within = (a: number | null) => a == null || Math.abs(a - invoiceTotal) < 0.01;

    return {
      invoice: { invoiceNo: invoice.invoiceNo, total: invoiceTotal },
      purchaseOrder: po ? { lpoNo: po.lpoNo, total: poTotal } : null,
      goodsReceipt: grn ? { grnNo: grn.grnNo, total: grnTotal } : null,
      matched: within(poTotal) && within(grnTotal),
    };
  }

  /** Record that `amount` was paid against this invoice, updating its status. */
  async applyPayment(facilityId: string, id: string, amount: number): Promise<void> {
    const inv = await this.get(facilityId, id);
    const paid = r2(Number(inv.amountPaid) + amount);
    inv.amountPaid = paid.toFixed(2);
    inv.status = paid >= Number(inv.total) - 0.01 ? 'paid' : paid > 0 ? 'partpaid' : 'unpaid';
    await this.invoices.save(inv);
  }
}
