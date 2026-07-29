import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity';
import { CreateItemDto, UpdateItemDto, AdjustStockDto } from './dto/inventory.dto';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
const r4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;
const today = () => new Date().toISOString().slice(0, 10);

export interface MovementParams {
  type: StockMovementType;
  quantity: number; // signed: + in, − out
  unitCost?: number; // required for inbound; ignored for outbound (uses avg cost)
  date?: string;
  reference?: string;
  sourceType?: string;
  sourceId?: string;
  note?: string;
  userId?: string;
}

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
    private readonly dataSource: DataSource,
    private readonly posting: HmisPostingService,
  ) {}

  // ── Items ───────────────────────────────────────────────────────────────────

  createItem(facilityId: string, dto: CreateItemDto): Promise<InventoryItem> {
    const item = this.items.create({
      facilityId,
      name: dto.name.trim(),
      sku: dto.sku ?? null,
      category: dto.category ?? 'drug',
      unit: dto.unit ?? 'unit',
      salePrice: String(dto.salePrice ?? 0),
      reorderLevel: String(dto.reorderLevel ?? 0),
      trackStock: dto.trackStock ?? true,
      inventoryAccountCode: dto.inventoryAccountCode ?? '13001',
      cogsAccountCode: dto.cogsAccountCode ?? '51001',
      revenueAccountCode: dto.revenueAccountCode ?? '42001',
    });
    return this.items.save(item);
  }

  listItems(facilityId: string, opts: { lowStock?: boolean; search?: string } = {}): Promise<InventoryItem[]> {
    const qb = this.items.createQueryBuilder('i').where('i.facilityId = :facilityId', { facilityId });
    if (opts.search) {
      qb.andWhere('(i.name ILIKE :s OR i.sku ILIKE :s)', { s: `%${opts.search.trim()}%` });
    }
    if (opts.lowStock) qb.andWhere('i.stock_qty <= i.reorder_level');
    return qb.orderBy('i.name', 'ASC').getMany();
  }

  async getItem(facilityId: string, id: string): Promise<InventoryItem> {
    const item = await this.items.findOne({ where: { id, facilityId } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async updateItem(facilityId: string, id: string, dto: UpdateItemDto): Promise<InventoryItem> {
    const item = await this.getItem(facilityId, id);
    Object.assign(item, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.salePrice !== undefined ? { salePrice: String(dto.salePrice) } : {}),
      ...(dto.reorderLevel !== undefined ? { reorderLevel: String(dto.reorderLevel) } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.inventoryAccountCode !== undefined ? { inventoryAccountCode: dto.inventoryAccountCode } : {}),
      ...(dto.cogsAccountCode !== undefined ? { cogsAccountCode: dto.cogsAccountCode } : {}),
      ...(dto.revenueAccountCode !== undefined ? { revenueAccountCode: dto.revenueAccountCode } : {}),
    });
    return this.items.save(item);
  }

  async getItemLedger(facilityId: string, id: string): Promise<StockMovement[]> {
    await this.getItem(facilityId, id);
    return this.movements.find({
      where: { facilityId, itemId: id },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Stock ledger (moving average) ─────────────────────────────────────────────

  /**
   * Apply one movement to an item and append the ledger row, inside the given
   * transaction manager. Inbound uses the supplied unit cost; outbound is valued
   * at the item's current moving-average cost. Returns the value moved (signed)
   * so the caller can post the matching journal.
   */
  async recordMovement(
    mgr: EntityManager,
    item: InventoryItem,
    params: MovementParams,
  ): Promise<{ movement: StockMovement; value: number; unitCost: number }> {
    const q0 = Number(item.stockQty);
    const v0 = Number(item.stockValue);

    let unitCost: number;
    let value: number;
    if (params.quantity >= 0) {
      unitCost = r4(params.unitCost ?? 0);
      value = r2(params.quantity * unitCost);
    } else {
      const avg = q0 > 0 ? v0 / q0 : 0;
      unitCost = r4(avg);
      value = r2(params.quantity * avg); // negative
    }

    const q1 = r3(q0 + params.quantity);
    let v1 = r2(v0 + value);
    if (q1 <= 0) v1 = 0; // out of stock → no residual value
    if (v1 < 0) v1 = 0;

    item.stockQty = q1.toFixed(3);
    item.stockValue = v1.toFixed(2);
    await mgr.getRepository(InventoryItem).save(item);

    const movement = mgr.getRepository(StockMovement).create({
      facilityId: item.facilityId,
      itemId: item.id,
      type: params.type,
      date: params.date ?? today(),
      quantity: params.quantity.toFixed(3),
      unitCost: unitCost.toFixed(4),
      value: value.toFixed(2),
      balanceQty: q1.toFixed(3),
      balanceValue: v1.toFixed(2),
      reference: params.reference ?? null,
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      note: params.note ?? null,
      createdById: params.userId ?? null,
    });
    const saved = await mgr.getRepository(StockMovement).save(movement);
    return { movement: saved, value, unitCost };
  }

  /**
   * Issue (consume/dispense) stock at cost. Posts Dr COGS, Cr Inventory. Used by
   * pharmacy/lab dispensing and any other consumption. Returns the cost value.
   */
  async issueStock(
    facilityId: string,
    itemId: string,
    quantity: number,
    opts: {
      date?: string;
      reference?: string;
      sourceType?: string;
      sourceId?: string;
      note?: string;
      costCenter?: string;
      userId?: string;
    } = {},
  ): Promise<{ item: InventoryItem; value: number }> {
    if (!(quantity > 0)) throw new BadRequestException('Issue quantity must be greater than 0');

    const { item, value } = await this.dataSource.transaction(async (mgr) => {
      const it = await mgr.getRepository(InventoryItem).findOne({ where: { id: itemId, facilityId } });
      if (!it) throw new NotFoundException('Item not found');
      const res = await this.recordMovement(mgr, it, {
        type: 'issue',
        quantity: -Math.abs(quantity),
        date: opts.date,
        reference: opts.reference,
        sourceType: opts.sourceType ?? 'stock_issue',
        sourceId: opts.sourceId,
        note: opts.note,
        userId: opts.userId,
      });
      return { item: it, value: Math.abs(res.value) };
    });

    await this.posting.onStockIssue({
      facilityId,
      date: opts.date ?? today(),
      cogsAccountCode: item.cogsAccountCode,
      inventoryAccountCode: item.inventoryAccountCode,
      value,
      description: opts.note ?? `Issue: ${item.name}`,
      costCenter: opts.costCenter,
      sourceType: opts.sourceType ?? 'stock_issue',
      sourceId: opts.sourceId,
    });

    return { item, value };
  }

  /** Manual stock adjustment (write-up/down or count correction). */
  async adjustStock(facilityId: string, itemId: string, dto: AdjustStockDto): Promise<InventoryItem> {
    if (!dto.quantity) throw new BadRequestException('Adjustment quantity cannot be zero');
    const inbound = dto.quantity > 0;

    const { item, value } = await this.dataSource.transaction(async (mgr) => {
      const it = await mgr.getRepository(InventoryItem).findOne({ where: { id: itemId, facilityId } });
      if (!it) throw new NotFoundException('Item not found');
      const res = await this.recordMovement(mgr, it, {
        type: inbound ? 'adjustment_in' : 'adjustment_out',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        date: dto.date,
        sourceType: 'stock_adjustment',
        note: dto.reason,
      });
      return { item: it, value: Math.abs(res.value) };
    });

    await this.posting.onStockAdjustment({
      facilityId,
      date: dto.date ?? today(),
      inventoryAccountCode: item.inventoryAccountCode,
      adjustmentAccountCode: item.cogsAccountCode,
      value,
      direction: inbound ? 'in' : 'out',
      description: dto.reason ?? `Adjustment: ${item.name}`,
      sourceType: 'stock_adjustment',
      sourceId: item.id,
    });

    return item;
  }
}
