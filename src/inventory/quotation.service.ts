import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quotation } from './entities/quotation.entity';
import { QuotationLine } from './entities/quotation-line.entity';
import { Supplier } from './entities/supplier.entity';
import { CreateQuotationDto } from './dto/quotation.dto';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class QuotationService {
  constructor(
    @InjectRepository(Quotation)
    private readonly quotes: Repository<Quotation>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
  ) {}

  async create(facilityId: string, dto: CreateQuotationDto, userId?: string): Promise<Quotation> {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId, facilityId } });
    if (!supplier) throw new BadRequestException('Unknown supplier');
    if (!dto.lines?.length) throw new BadRequestException('A quotation needs at least one line');

    const subtotal = r2(dto.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    const taxRate = dto.taxRate ?? 0;
    const taxAmount = r2((subtotal * taxRate) / 100);
    const total = r2(subtotal + taxAmount);
    const count = await this.quotes.count({ where: { facilityId } });

    const quote = this.quotes.create({
      facilityId,
      quoteNo: `QT-${String(count + 1).padStart(6, '0')}`,
      supplierId: supplier.id,
      purchaseRequisitionId: dto.purchaseRequisitionId ?? null,
      supplierRef: dto.supplierRef ?? null,
      date: dto.date ?? today(),
      validUntil: dto.validUntil ?? null,
      status: 'received',
      subtotal: subtotal.toFixed(2),
      taxRate: taxRate.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      notes: dto.notes ?? null,
      createdById: userId ?? null,
      lines: dto.lines.map((l) =>
        this.quotes.manager.getRepository(QuotationLine).create({
          itemId: l.itemId ?? null,
          description: l.description.trim(),
          quantity: l.quantity.toFixed(3),
          unitPrice: l.unitPrice.toFixed(2),
          lineTotal: r2(l.quantity * l.unitPrice).toFixed(2),
        }),
      ),
    });
    return this.quotes.save(quote);
  }

  list(facilityId: string, opts: { requisitionId?: string } = {}): Promise<Quotation[]> {
    const where: any = { facilityId };
    if (opts.requisitionId) where.purchaseRequisitionId = opts.requisitionId;
    return this.quotes.find({ where, relations: ['lines'], order: { createdAt: 'DESC' }, take: 200 });
  }

  async get(facilityId: string, id: string): Promise<Quotation> {
    const q = await this.quotes.findOne({ where: { id, facilityId }, relations: ['lines'] });
    if (!q) throw new NotFoundException('Quotation not found');
    return q;
  }

  /** Mark a quote as the chosen one; any sibling for the same PR reverts to received. */
  async select(facilityId: string, id: string): Promise<Quotation> {
    const q = await this.get(facilityId, id);
    if (q.purchaseRequisitionId) {
      await this.quotes.update(
        { facilityId, purchaseRequisitionId: q.purchaseRequisitionId, status: 'selected' },
        { status: 'received' },
      );
    }
    q.status = 'selected';
    return this.quotes.save(q);
  }

  async reject(facilityId: string, id: string): Promise<Quotation> {
    const q = await this.get(facilityId, id);
    q.status = 'rejected';
    return this.quotes.save(q);
  }
}
