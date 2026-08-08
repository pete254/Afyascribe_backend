import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LabTest } from './entities/lab-test.entity';
import { LabAnalyte } from './entities/lab-analyte.entity';
import { LabOrder, LabStatus } from './entities/lab-order.entity';
import { LabOrderItem } from './entities/lab-order-item.entity';
import { LabResultValue, LabFlag } from './entities/lab-result-value.entity';
import {
  CreateLabTestDto,
  UpdateLabTestDto,
  CreateLabOrderDto,
  CollectSampleDto,
  SubmitResultDto,
} from './dto/lab.dto';
import { CurrentUserType } from '../common/decorators/current-user.decorator';
import { LAB_TEST_SEED } from './data/lab-test-seed';

/** Stage ordering, so the order's status can be the least-advanced active item. */
const STAGE: Record<LabStatus, number> = {
  ordered: 0,
  collected: 1,
  in_progress: 2,
  resulted: 3,
  verified: 4,
  cancelled: 99,
};

@Injectable()
export class LabService {
  constructor(
    @InjectRepository(LabTest) private readonly tests: Repository<LabTest>,
    @InjectRepository(LabOrder) private readonly orders: Repository<LabOrder>,
    @InjectRepository(LabOrderItem) private readonly items: Repository<LabOrderItem>,
    @InjectRepository(LabResultValue) private readonly values: Repository<LabResultValue>,
  ) {}

  private fullName(u: CurrentUserType): string {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  }

  /** Flag a value against its reference range: High/Low for numeric, Abnormal for text. */
  private flagFor(
    value: string | null | undefined,
    refLow: string | null,
    refHigh: string | null,
    refText: string | null,
  ): LabFlag | null {
    if (value == null || value === '') return null;
    const num = Number(value);
    const hasNumericRange = refLow != null || refHigh != null;
    if (hasNumericRange && !Number.isNaN(num)) {
      if (refHigh != null && num > Number(refHigh)) return 'high';
      if (refLow != null && num < Number(refLow)) return 'low';
      return 'normal';
    }
    if (refText) {
      return value.trim().toLowerCase() === refText.trim().toLowerCase() ? 'normal' : 'abnormal';
    }
    return null;
  }

  // ── Catalog ─────────────────────────────────────────────────────────────────

  listTests(facilityId: string, opts: { activeOnly?: boolean } = {}): Promise<LabTest[]> {
    const qb = this.tests
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.analytes', 'a')
      .where('t.facilityId = :facilityId', { facilityId });
    if (opts.activeOnly) qb.andWhere('t.isActive = true');
    return qb.orderBy('t.sortOrder', 'ASC').addOrderBy('t.name', 'ASC').addOrderBy('a.sortOrder', 'ASC').getMany();
  }

  async createTest(facilityId: string, dto: CreateLabTestDto): Promise<LabTest> {
    const test = this.tests.create({
      facilityId,
      code: dto.code ?? null,
      name: dto.name.trim(),
      specimen: dto.specimen ?? 'blood',
      department: dto.department ?? null,
      price: String(dto.price ?? 0),
      turnaroundHours: dto.turnaroundHours ?? null,
      analytes: (dto.analytes ?? []).map((a, i) => this.buildAnalyte(a, i)),
    });
    return this.tests.save(test);
  }

  private buildAnalyte(a: CreateLabTestDto['analytes'][number], i: number): LabAnalyte {
    const analyte = new LabAnalyte();
    analyte.name = a.name.trim();
    analyte.unit = a.unit ?? null;
    analyte.refLow = a.refLow != null ? String(a.refLow) : null;
    analyte.refHigh = a.refHigh != null ? String(a.refHigh) : null;
    analyte.refText = a.refText ?? null;
    analyte.sortOrder = i;
    return analyte;
  }

  async updateTest(facilityId: string, id: string, dto: UpdateLabTestDto): Promise<LabTest> {
    const test = await this.tests.findOne({ where: { id, facilityId } });
    if (!test) throw new NotFoundException('Test not found');
    if (dto.code !== undefined) test.code = dto.code;
    if (dto.name !== undefined) test.name = dto.name.trim();
    if (dto.specimen !== undefined) test.specimen = dto.specimen;
    if (dto.department !== undefined) test.department = dto.department;
    if (dto.price !== undefined) test.price = String(dto.price);
    if (dto.turnaroundHours !== undefined) test.turnaroundHours = dto.turnaroundHours;
    if (dto.isActive !== undefined) test.isActive = dto.isActive;
    if (dto.analytes !== undefined) {
      test.analytes = dto.analytes.map((a, i) => this.buildAnalyte(a, i)); // cascade replaces
    }
    return this.tests.save(test);
  }

  /** Seed a starter catalog of common tests (idempotent — only when empty). */
  async seedTests(facilityId: string): Promise<{ created: number }> {
    const count = await this.tests.count({ where: { facilityId } });
    if (count > 0) return { created: 0 };
    const rows = LAB_TEST_SEED.map((t, ti) =>
      this.tests.create({
        facilityId,
        code: t.code,
        name: t.name,
        specimen: t.specimen,
        department: t.department,
        price: String(t.price ?? 0),
        sortOrder: ti,
        analytes: t.analytes.map((a, i) => this.buildAnalyte(a, i)),
      }),
    );
    await this.tests.save(rows);
    return { created: rows.length };
  }

  // ── Orders ────────────────────────────────────────────────────────────────────

  private async nextOrderNo(facilityId: string): Promise<string> {
    const n = await this.orders.count({ where: { facilityId } });
    return `LAB-${String(n + 1).padStart(5, '0')}`;
  }

  async createOrder(facilityId: string, user: CurrentUserType, dto: CreateLabOrderDto): Promise<LabOrder> {
    const tests = await this.tests.find({ where: { id: In(dto.testIds), facilityId } });
    if (tests.length === 0) throw new BadRequestException('No valid tests selected');
    const byId = new Map(tests.map((t) => [t.id, t]));

    const order = this.orders.create({
      facilityId,
      orderNo: await this.nextOrderNo(facilityId),
      patientId: dto.patientId,
      patientName: dto.patientName ?? null,
      patientNo: dto.patientNo ?? null,
      visitId: dto.visitId ?? null,
      orderedById: user.id,
      orderedByName: this.fullName(user),
      priority: dto.priority ?? 'routine',
      clinicalNotes: dto.clinicalNotes ?? null,
      status: 'ordered',
      items: dto.testIds
        .filter((id) => byId.has(id))
        .map((id) => {
          const t = byId.get(id)!;
          const item = new LabOrderItem();
          item.labTestId = t.id;
          item.testName = t.name;
          item.specimen = t.specimen;
          item.department = t.department;
          item.price = t.price;
          item.status = 'ordered';
          return item;
        }),
    });
    return this.orders.save(order);
  }

  listOrders(
    facilityId: string,
    filter: { status?: string; patientId?: string; visitId?: string } = {},
  ): Promise<LabOrder[]> {
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'i')
      .leftJoinAndSelect('i.results', 'r')
      .where('o.facilityId = :facilityId', { facilityId });
    if (filter.status) qb.andWhere('o.status = :status', { status: filter.status });
    if (filter.patientId) qb.andWhere('o.patientId = :patientId', { patientId: filter.patientId });
    if (filter.visitId) qb.andWhere('o.visitId = :visitId', { visitId: filter.visitId });
    return qb.orderBy('o.createdAt', 'DESC').addOrderBy('r.sortOrder', 'ASC').getMany();
  }

  async getOrder(facilityId: string, id: string): Promise<LabOrder> {
    const order = await this.orders.findOne({ where: { id, facilityId } });
    if (!order) throw new NotFoundException('Lab order not found');
    return order;
  }

  /**
   * The lab worklist: individual test items at a given stage, newest first, with
   * their order context flattened in for display.
   */
  async worklist(facilityId: string, stage: LabStatus): Promise<any[]> {
    const orders = await this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'i')
      .leftJoinAndSelect('i.results', 'r')
      .where('o.facilityId = :facilityId', { facilityId })
      .andWhere('i.status = :stage', { stage })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('r.sortOrder', 'ASC')
      .getMany();

    const rows: any[] = [];
    for (const o of orders) {
      for (const it of (o.items ?? []).filter((x) => x.status === stage)) {
        rows.push({
          orderId: o.id,
          orderNo: o.orderNo,
          patientId: o.patientId,
          patientName: o.patientName,
          patientNo: o.patientNo,
          visitId: o.visitId,
          priority: o.priority,
          orderedByName: o.orderedByName,
          createdAt: o.createdAt,
          item: it,
        });
      }
    }
    return rows;
  }

  // ── Workflow transitions (per test item) ──────────────────────────────────────

  private async loadItem(facilityId: string, orderId: string, itemId: string) {
    const order = await this.getOrder(facilityId, orderId);
    const item = (order.items ?? []).find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Test item not found');
    return { order, item };
  }

  /** Recompute the order status as the least-advanced non-cancelled item. */
  private async syncOrderStatus(orderId: string): Promise<void> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) return;
    const active = (order.items ?? []).filter((i) => i.status !== 'cancelled');
    let status: LabStatus;
    if (active.length === 0) status = 'cancelled';
    else {
      const min = Math.min(...active.map((i) => STAGE[i.status]));
      status = (Object.keys(STAGE) as LabStatus[]).find((k) => STAGE[k] === min) ?? 'ordered';
    }
    if (order.status !== status) {
      order.status = status;
      await this.orders.save(order);
    }
  }

  async collect(facilityId: string, orderId: string, itemId: string, user: CurrentUserType, dto: CollectSampleDto) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'ordered') throw new BadRequestException('Sample already collected for this test');
    item.status = 'collected';
    item.collectedById = user.id;
    item.collectedByName = this.fullName(user);
    item.collectedAt = new Date();
    item.specimenNote = dto.specimenNote ?? null;
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  async startTest(facilityId: string, orderId: string, itemId: string) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'collected') throw new BadRequestException('Collect the sample before starting the test');
    item.status = 'in_progress';
    item.startedAt = new Date();
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  async submitResult(
    facilityId: string,
    orderId: string,
    itemId: string,
    user: CurrentUserType,
    dto: SubmitResultDto,
  ) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status === 'ordered') {
      throw new BadRequestException('Collect the sample before entering results');
    }
    if (item.status === 'verified') {
      throw new BadRequestException('These results are already posted');
    }

    // Replace the result set (cascade delete-orphan not enabled, so clear first).
    await this.values.delete({ orderItemId: item.id });
    item.results = dto.values.map((v, i) => {
      const rv = new LabResultValue();
      rv.orderItemId = item.id;
      rv.analyteId = v.analyteId ?? null;
      rv.analyteName = v.analyteName;
      rv.unit = v.unit ?? null;
      rv.refLow = v.refLow != null ? String(v.refLow) : null;
      rv.refHigh = v.refHigh != null ? String(v.refHigh) : null;
      rv.refText = v.refText ?? null;
      rv.value = v.value ?? null;
      rv.flag = this.flagFor(v.value, rv.refLow, rv.refHigh, rv.refText);
      rv.sortOrder = i;
      return rv;
    });
    item.resultNote = dto.resultNote ?? null;
    item.resultedById = user.id;
    item.resultedByName = this.fullName(user);
    item.resultedAt = new Date();

    if (dto.post) {
      item.status = 'verified';
      item.verifiedById = user.id;
      item.verifiedByName = this.fullName(user);
      item.verifiedAt = new Date();
    } else {
      item.status = 'resulted';
    }

    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  async verify(facilityId: string, orderId: string, itemId: string, user: CurrentUserType) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'resulted') throw new BadRequestException('Enter results before posting');
    item.status = 'verified';
    item.verifiedById = user.id;
    item.verifiedByName = this.fullName(user);
    item.verifiedAt = new Date();
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  async cancelItem(facilityId: string, orderId: string, itemId: string) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status === 'verified') throw new BadRequestException('Cannot cancel a posted test');
    item.status = 'cancelled';
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  // ── Patient results (posted) + trends ─────────────────────────────────────────

  /**
   * Posted results for a patient, newest order first — the record the clinician
   * reads. `trends` groups verified numeric values by analyte over time so a
   * value can be shown against its own history.
   */
  async patientResults(facilityId: string, patientId: string) {
    const orders = await this.orders
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'i')
      .leftJoinAndSelect('i.results', 'r')
      .where('o.facilityId = :facilityId', { facilityId })
      .andWhere('o.patientId = :patientId', { patientId })
      .andWhere('i.status = :verified', { verified: 'verified' })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('r.sortOrder', 'ASC')
      .getMany();

    const trends: Record<string, { date: Date; value: number; unit: string | null; flag: LabFlag | null }[]> = {};
    for (const o of orders) {
      for (const it of o.items ?? []) {
        if (it.status !== 'verified') continue;
        for (const rv of it.results ?? []) {
          const num = Number(rv.value);
          if (rv.value == null || Number.isNaN(num)) continue;
          (trends[rv.analyteName] ??= []).push({
            date: it.verifiedAt ?? o.createdAt,
            value: num,
            unit: rv.unit,
            flag: rv.flag,
          });
        }
      }
    }
    // Oldest → newest for charting.
    for (const k of Object.keys(trends)) trends[k].reverse();

    return { orders, trends };
  }
}
