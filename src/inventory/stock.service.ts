import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity';
import { StockBatch } from './entities/stock-batch.entity';
import { CreateItemDto, UpdateItemDto, AdjustStockDto } from './dto/inventory.dto';
import { HmisPostingService } from '../accounting/hmis-posting.service';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;
const r4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;
const today = () => new Date().toISOString().slice(0, 10);

/** Sale price derived from a cost and a markup %: cost × (1 + markup/100). */
const priceFromMarkup = (cost: number, markupPct: number) => r2(cost * (1 + markupPct / 100));

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
    @InjectRepository(StockBatch)
    private readonly batches: Repository<StockBatch>,
    private readonly dataSource: DataSource,
    private readonly posting: HmisPostingService,
  ) {}

  // ── Items ───────────────────────────────────────────────────────────────────

  createItem(facilityId: string, dto: CreateItemDto): Promise<InventoryItem> {
    const costPrice = dto.costPrice ?? 0;
    const markupPct = dto.markupPct ?? null;
    // Explicit sale price wins; otherwise derive it from cost + markup when both
    // are usable, so a drug can be priced by markup alone.
    const salePrice =
      dto.salePrice != null
        ? dto.salePrice
        : markupPct != null && costPrice > 0
          ? priceFromMarkup(costPrice, markupPct)
          : 0;

    const item = this.items.create({
      facilityId,
      name: dto.name.trim(),
      sku: dto.sku ?? null,
      category: dto.category ?? 'drug',
      unit: dto.unit ?? 'unit',
      salePrice: String(salePrice),
      costPrice: String(costPrice),
      markupPct: markupPct != null ? String(markupPct) : null,
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
      ...(dto.costPrice !== undefined ? { costPrice: String(dto.costPrice) } : {}),
      ...(dto.markupPct !== undefined ? { markupPct: dto.markupPct === null ? null : String(dto.markupPct) } : {}),
      ...(dto.reorderLevel !== undefined ? { reorderLevel: String(dto.reorderLevel) } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.inventoryAccountCode !== undefined ? { inventoryAccountCode: dto.inventoryAccountCode } : {}),
      ...(dto.cogsAccountCode !== undefined ? { cogsAccountCode: dto.cogsAccountCode } : {}),
      ...(dto.revenueAccountCode !== undefined ? { revenueAccountCode: dto.revenueAccountCode } : {}),
    });
    // Explicit sale price wins; otherwise, if cost or markup changed and a markup
    // is in force, re-derive the sale price.
    if (dto.salePrice !== undefined) {
      item.salePrice = String(dto.salePrice);
    } else if (
      (dto.costPrice !== undefined || dto.markupPct !== undefined) &&
      item.markupPct != null &&
      Number(item.costPrice) > 0
    ) {
      item.salePrice = priceFromMarkup(Number(item.costPrice), Number(item.markupPct)).toFixed(2);
    }
    return this.items.save(item);
  }

  async getItemLedger(facilityId: string, id: string): Promise<StockMovement[]> {
    await this.getItem(facilityId, id);
    return this.movements.find({
      where: { facilityId, itemId: id },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Drug performance (stock-movement analytics) ───────────────────────────────

  /**
   * Per-item performance over a period, derived from the stock ledger: units
   * received vs issued, cost of what went out, estimated retail and margin at
   * the current sale price, and how briskly the item turns. Items with no
   * movement in the window surface as dead stock (rank 'dead').
   */
  async performanceReport(
    facilityId: string,
    range: { from?: string; to?: string } = {},
  ) {
    const items = await this.items.find({ where: { facilityId } });

    const qb = this.movements
      .createQueryBuilder('m')
      .where('m.facilityId = :facilityId', { facilityId });
    if (range.from) qb.andWhere('m.date >= :from', { from: range.from });
    if (range.to) qb.andWhere('m.date <= :to', { to: range.to });
    const movements = await qb.getMany();

    type Agg = { qtyIn: number; qtyOut: number; costOut: number; count: number; last: string | null };
    const agg = new Map<string, Agg>();
    for (const m of movements) {
      const q = Number(m.quantity);
      const v = Number(m.value);
      const a = agg.get(m.itemId) ?? { qtyIn: 0, qtyOut: 0, costOut: 0, count: 0, last: null };
      if (q >= 0) {
        a.qtyIn += q;
      } else {
        a.qtyOut += -q;
        a.costOut += -v; // value is negative on the way out
      }
      a.count += 1;
      if (!a.last || m.date > a.last) a.last = m.date;
      agg.set(m.itemId, a);
    }

    const rows = items.map((it) => {
      const a = agg.get(it.id) ?? { qtyIn: 0, qtyOut: 0, costOut: 0, count: 0, last: null };
      const salePrice = Number(it.salePrice);
      const stockValue = Number(it.stockValue);
      const estRetail = r2(a.qtyOut * salePrice);
      const margin = r2(estRetail - r2(a.costOut));
      // Turnover ≈ cost of goods issued in the period ÷ current stock value.
      const turnover = stockValue > 0 ? r2(r2(a.costOut) / stockValue) : 0;
      return {
        id: it.id,
        name: it.name,
        sku: it.sku,
        category: it.category,
        unit: it.unit,
        salePrice,
        costPrice: Number(it.costPrice),
        stockQty: Number(it.stockQty),
        stockValue,
        reorderLevel: Number(it.reorderLevel),
        lowStock: Number(it.stockQty) <= Number(it.reorderLevel),
        qtyIn: r3(a.qtyIn),
        qtyOut: r3(a.qtyOut),
        costOut: r2(a.costOut),
        estRetail,
        margin,
        turnover,
        movements: a.count,
        lastMovement: a.last,
      };
    });

    // Rank by units issued; classify the top third as fast, then slow, and
    // anything that never moved as dead stock.
    const moved = rows.filter((r) => r.qtyOut > 0).sort((x, y) => y.qtyOut - x.qtyOut);
    const fastCut = Math.ceil(moved.length / 3);
    const rankById = new Map<string, 'fast' | 'slow'>();
    moved.forEach((r, i) => rankById.set(r.id, i < fastCut ? 'fast' : 'slow'));
    const ranked = rows
      .map((r) => ({ ...r, rank: (rankById.get(r.id) ?? 'dead') as 'fast' | 'slow' | 'dead' }))
      .sort((x, y) => y.qtyOut - x.qtyOut || y.estRetail - x.estRetail);

    const totals = {
      items: rows.length,
      itemsMoved: moved.length,
      deadStock: rows.length - moved.length,
      costOut: r2(rows.reduce((s, r) => s + r.costOut, 0)),
      estRetail: r2(rows.reduce((s, r) => s + r.estRetail, 0)),
      margin: r2(rows.reduce((s, r) => s + r.margin, 0)),
      stockValue: r2(rows.reduce((s, r) => s + r.stockValue, 0)),
    };

    return { from: range.from ?? null, to: range.to ?? null, rows: ranked, totals };
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

    // On any inbound movement, keep the reference cost in step with the new
    // moving-average cost, and — when the item is markup-priced — re-derive its
    // sale price so a change in buying cost flows straight through to the shelf.
    if (params.quantity >= 0 && q1 > 0) {
      const avgCost = r2(v1 / q1);
      item.costPrice = avgCost.toFixed(2);
      if (item.markupPct != null) {
        item.salePrice = priceFromMarkup(avgCost, Number(item.markupPct)).toFixed(2);
      }
    }

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

  // ── Batches (FEFO) ────────────────────────────────────────────────────────────

  /** Record a received lot with its expiry, so stock can be consumed FEFO. */
  async createBatch(
    mgr: EntityManager,
    params: {
      facilityId: string;
      itemId: string;
      batchNo?: string | null;
      expiryDate?: string | null;
      quantity: number;
      unitCost?: number;
      date?: string;
      sourceType?: string;
      sourceId?: string;
    },
  ): Promise<void> {
    if (!(params.quantity > 0)) return;
    const qty = r3(params.quantity).toFixed(3);
    const batch = mgr.getRepository(StockBatch).create({
      facilityId: params.facilityId,
      itemId: params.itemId,
      batchNo: params.batchNo ?? null,
      expiryDate: params.expiryDate ?? null,
      qtyReceived: qty,
      qtyRemaining: qty,
      unitCost: r4(params.unitCost ?? 0).toFixed(4),
      receivedAt: params.date ?? today(),
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
    });
    await mgr.getRepository(StockBatch).save(batch);
  }

  /**
   * Draw `quantity` down from the earliest-expiring non-expired batches (FEFO).
   * Expired lots are skipped so they aren't dispensed. Any shortfall (legacy
   * stock received before batches existed) is left untracked — the item's master
   * quantity has already been reduced, so we never fail the caller.
   */
  async consumeFefo(mgr: EntityManager, facilityId: string, itemId: string, quantity: number): Promise<void> {
    let remaining = r3(Math.abs(quantity));
    if (remaining <= 0) return;
    const rows = await mgr
      .getRepository(StockBatch)
      .createQueryBuilder('b')
      .where('b.facilityId = :facilityId', { facilityId })
      .andWhere('b.itemId = :itemId', { itemId })
      .andWhere('b.qtyRemaining > 0')
      .andWhere('(b.expiryDate IS NULL OR b.expiryDate >= :today)', { today: today() })
      .orderBy('b.expiryDate', 'ASC', 'NULLS LAST')
      .addOrderBy('b.receivedAt', 'ASC')
      .getMany();
    for (const b of rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.qtyRemaining));
      b.qtyRemaining = r3(Number(b.qtyRemaining) - take).toFixed(3);
      remaining = r3(remaining - take);
      await mgr.getRepository(StockBatch).save(b);
    }
  }

  /**
   * Issue (consume/dispense) stock at cost. Posts Dr COGS, Cr Inventory. Used by
   * pharmacy/lab dispensing and any other consumption.
   *
   * The item row is locked FOR UPDATE inside the transaction, so concurrent
   * issues of the same item serialize and can never overdraw (no lost updates —
   * the second issue waits, then reads the already-reduced quantity). With
   * `capToStock`, the issue is clamped to what's actually on hand and the amount
   * issued is returned, so a caller can leave any shortfall unfilled rather than
   * driving stock negative.
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
      /** Clamp the issue to on-hand stock instead of going negative. */
      capToStock?: boolean;
    } = {},
  ): Promise<{ item: InventoryItem; value: number; issued: number }> {
    if (!(quantity > 0)) throw new BadRequestException('Issue quantity must be greater than 0');

    const { item, value, issued } = await this.dataSource.transaction(async (mgr) => {
      const it = await mgr.getRepository(InventoryItem).findOne({
        where: { id: itemId, facilityId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!it) throw new NotFoundException('Item not found');

      // Under the row lock, decide how much we can actually issue.
      let qty = Math.abs(quantity);
      if (opts.capToStock) {
        const available = Math.max(0, Number(it.stockQty));
        qty = Math.min(qty, available);
      }
      if (!(qty > 0)) return { item: it, value: 0, issued: 0 };

      const res = await this.recordMovement(mgr, it, {
        type: 'issue',
        quantity: -qty,
        date: opts.date,
        reference: opts.reference,
        sourceType: opts.sourceType ?? 'stock_issue',
        sourceId: opts.sourceId,
        note: opts.note,
        userId: opts.userId,
      });
      await this.consumeFefo(mgr, facilityId, itemId, qty);
      return { item: it, value: Math.abs(res.value), issued: qty };
    });

    // Nothing left to issue after capping — no movement, no journal.
    if (issued <= 0) return { item, value: 0, issued: 0 };

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

    return { item, value, issued };
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
      if (inbound) {
        await this.createBatch(mgr, {
          facilityId,
          itemId,
          batchNo: dto.batchNo,
          expiryDate: dto.expiryDate,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          date: dto.date,
          sourceType: 'stock_adjustment',
          sourceId: it.id,
        });
      } else {
        await this.consumeFefo(mgr, facilityId, itemId, dto.quantity);
      }
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

  /**
   * Apply a physical stock count. Each line carries a counted quantity for an
   * item; the difference against the system quantity is booked as an adjustment
   * (in or out) at the item's moving-average cost, stock movements and batches
   * are written, and the matching ledger journals are posted. Returns a report
   * of every variance and the financial impact — the write-up/write-down value.
   */
  async applyStockCount(
    facilityId: string,
    lines: { itemId: string; countedQty: number; reason?: string }[],
    date?: string,
  ): Promise<{
    date: string;
    lines: {
      itemId: string; name: string; category: string; unit: string;
      systemQty: number; countedQty: number; variance: number;
      unitCost: number; valueDelta: number; direction: 'in' | 'out' | 'none';
    }[];
    totals: {
      itemsCounted: number; itemsAdjusted: number;
      increaseValue: number; decreaseValue: number; netValue: number;
    };
  }> {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException('No count lines supplied');
    }
    const when = date ?? today();

    // Collapse duplicate itemIds (last counted value wins) and validate numbers.
    const counted = new Map<string, { countedQty: number; reason?: string }>();
    for (const l of lines) {
      if (!l.itemId) continue;
      const qty = Number(l.countedQty);
      if (!Number.isFinite(qty) || qty < 0) {
        throw new BadRequestException(`Invalid counted quantity for item ${l.itemId}`);
      }
      counted.set(l.itemId, { countedQty: r3(qty), reason: l.reason });
    }

    const report: {
      itemId: string; name: string; category: string; unit: string;
      systemQty: number; countedQty: number; variance: number;
      unitCost: number; valueDelta: number; direction: 'in' | 'out' | 'none';
    }[] = [];
    const toPost: {
      inventoryAccountCode: string; cogsAccountCode: string;
      value: number; direction: 'in' | 'out'; name: string; itemId: string; reason?: string;
    }[] = [];

    await this.dataSource.transaction(async (mgr) => {
      for (const [itemId, { countedQty, reason }] of counted) {
        const item = await mgr.getRepository(InventoryItem).findOne({ where: { id: itemId, facilityId } });
        if (!item) throw new BadRequestException(`Unknown item ${itemId}`);

        const systemQty = r3(Number(item.stockQty));
        const variance = r3(countedQty - systemQty);

        if (Math.abs(variance) < 0.0005) {
          report.push({
            itemId, name: item.name, category: item.category, unit: item.unit,
            systemQty, countedQty, variance: 0, unitCost: r2(Number(item.costPrice)),
            valueDelta: 0, direction: 'none',
          });
          continue;
        }

        const inbound = variance > 0;
        const unitCost = r2(Number(item.costPrice));
        const res = await this.recordMovement(mgr, item, {
          type: inbound ? 'adjustment_in' : 'adjustment_out',
          quantity: variance,
          unitCost: inbound ? unitCost : undefined,
          date: when,
          sourceType: 'stock_count',
          note: reason ?? 'Physical count adjustment',
        });

        if (inbound) {
          await this.createBatch(mgr, {
            facilityId, itemId,
            batchNo: null, expiryDate: null,
            quantity: variance, unitCost, date: when,
            sourceType: 'stock_count', sourceId: item.id,
          });
        } else {
          await this.consumeFefo(mgr, facilityId, itemId, variance);
        }

        const valueDelta = r2(res.value); // signed: negative for shrinkage
        report.push({
          itemId, name: item.name, category: item.category, unit: item.unit,
          systemQty, countedQty, variance,
          unitCost: r2(res.unitCost) || unitCost,
          valueDelta, direction: inbound ? 'in' : 'out',
        });
        toPost.push({
          inventoryAccountCode: item.inventoryAccountCode,
          cogsAccountCode: item.cogsAccountCode,
          value: Math.abs(valueDelta),
          direction: inbound ? 'in' : 'out',
          name: item.name, itemId: item.id, reason,
        });
      }
    });

    // Post the ledger impact per item (best-effort, mirrors adjustStock).
    for (const p of toPost) {
      await this.posting.onStockAdjustment({
        facilityId,
        date: when,
        inventoryAccountCode: p.inventoryAccountCode,
        adjustmentAccountCode: p.cogsAccountCode,
        value: p.value,
        direction: p.direction,
        description: p.reason ? `Stock count: ${p.name} — ${p.reason}` : `Stock count: ${p.name}`,
        sourceType: 'stock_count',
        sourceId: p.itemId,
      });
    }

    const increaseValue = r2(report.filter((l) => l.direction === 'in').reduce((s, l) => s + l.valueDelta, 0));
    const decreaseValue = r2(report.filter((l) => l.direction === 'out').reduce((s, l) => s + l.valueDelta, 0));
    return {
      date: when,
      lines: report,
      totals: {
        itemsCounted: report.length,
        itemsAdjusted: report.filter((l) => l.direction !== 'none').length,
        increaseValue,
        decreaseValue,
        netValue: r2(increaseValue + decreaseValue),
      },
    };
  }

  // ── Expiry ────────────────────────────────────────────────────────────────────

  /** Batches still holding stock for an item, earliest expiry first. */
  async listItemBatches(facilityId: string, itemId: string): Promise<StockBatch[]> {
    return this.batches.find({
      where: { facilityId, itemId },
      order: { expiryDate: 'ASC' },
    });
  }

  /**
   * Batches whose remaining stock has expired or is expiring within `withinDays`,
   * with the item name and the value still tied up in each — for the expiry
   * report and dashboard alerts.
   */
  async expiryReport(facilityId: string, withinDays = 90) {
    const rows = await this.batches
      .createQueryBuilder('b')
      .where('b.facilityId = :facilityId', { facilityId })
      .andWhere('b.qtyRemaining > 0')
      .andWhere('b.expiryDate IS NOT NULL')
      .orderBy('b.expiryDate', 'ASC')
      .getMany();

    const items = await this.items.find({ where: { facilityId } });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const t = today();
    const soon = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);
    const dayMs = 86400000;

    const toRow = (b: StockBatch) => {
      const it = itemById.get(b.itemId);
      const qty = Number(b.qtyRemaining);
      const daysLeft = Math.round((new Date(b.expiryDate!).getTime() - new Date(t).getTime()) / dayMs);
      return {
        id: b.id,
        itemId: b.itemId,
        itemName: it?.name ?? '—',
        unit: it?.unit ?? '',
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        qtyRemaining: qty,
        value: r2(qty * Number(b.unitCost)),
        daysLeft,
      };
    };

    const expired = rows.filter((b) => (b.expiryDate as string) < t).map(toRow);
    const expiringSoon = rows
      .filter((b) => (b.expiryDate as string) >= t && (b.expiryDate as string) <= soon)
      .map(toRow);

    const sum = (arr: { value: number }[]) => r2(arr.reduce((s, r) => s + r.value, 0));
    return {
      withinDays,
      expired,
      expiringSoon,
      summary: {
        expiredCount: expired.length,
        expiredValue: sum(expired),
        soonCount: expiringSoon.length,
        soonValue: sum(expiringSoon),
      },
    };
  }
}
