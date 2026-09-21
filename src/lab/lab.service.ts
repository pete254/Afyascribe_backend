import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
  RejectSampleDto,
  AmendResultDto,
  ResultValueDto,
} from './dto/lab.dto';
import { CurrentUserType } from '../common/decorators/current-user.decorator';
import { LAB_TEST_SEED } from './data/lab-test-seed';
import { BillingService } from '../billing/billing.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { OclClient, OclConcept } from '../terminology/ocl.client';

/** Stage ordering, so the order's status can be the least-advanced active item. */
const STAGE: Record<LabStatus, number> = {
  requested: 0,
  in_lab: 1,
  awaiting_review: 2,
  released: 3,
  cancelled: 99,
};

/** One line of the lab ledger — a single test with its workflow milestones. */
export interface LabLedgerRow {
  orderId: string;
  itemId: string;
  orderNo: string;
  orderedAt: string | null;
  patientId: string;
  patientName: string;
  patientNo: string | null;
  testName: string;
  department: string | null;
  orderedBy: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
  resultedAt: string | null;
  resultedBy: string | null;
  releasedAt: string | null;
  status: LabStatus;
  charge: number;
}

export interface LabLedger {
  summary: {
    ordered: number;
    collected: number;
    resulted: number;
    released: number;
    cancelled: number;
    charge: number;
  };
  rows: LabLedgerRow[];
}

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(
    @InjectRepository(LabTest) private readonly tests: Repository<LabTest>,
    @InjectRepository(LabOrder) private readonly orders: Repository<LabOrder>,
    @InjectRepository(LabOrderItem) private readonly items: Repository<LabOrderItem>,
    @InjectRepository(LabResultValue) private readonly values: Repository<LabResultValue>,
    private readonly billing: BillingService,
    private readonly ocl: OclClient,
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

  /**
   * DESTRUCTIVE: wipe a facility's lab data (results, orders, tests) for a clean
   * standardized start. Intended for a facility that has only test/dummy data.
   */
  async resetCatalogue(facilityId: string): Promise<{ tests: number; orders: number }> {
    const orderIds = (await this.orders.find({ where: { facilityId }, select: ['id'] })).map((o) => o.id);
    if (orderIds.length) {
      const itemIds = (await this.items.find({ where: { orderId: In(orderIds) }, select: ['id'] })).map((i) => i.id);
      if (itemIds.length) await this.values.delete({ orderItemId: In(itemIds) });
      await this.items.delete({ orderId: In(orderIds) });
    }
    await this.orders.delete({ facilityId });

    const testIds = (await this.tests.find({ where: { facilityId }, select: ['id'] })).map((t) => t.id);
    if (testIds.length) await this.tests.manager.getRepository(LabAnalyte).delete({ labTestId: In(testIds) });
    await this.tests.delete({ facilityId });

    return { tests: testIds.length, orders: orderIds.length };
  }

  /**
   * Seed the lab catalogue from the KNHTS national investigations list
   * (MOH-PPB/Investigations, Laboratory domain only), each carrying its LOINC
   * code. Prices and reference ranges are left for the facility to fill in.
   * Skips any test already present by KNHTS code.
   */
  async importLabTestsFromKnhts(facilityId: string): Promise<number> {
    const existing = new Set(
      (await this.tests.find({ where: { facilityId }, select: ['knhtsCode'] }))
        .map((t) => t.knhtsCode)
        .filter(Boolean) as string[],
    );
    const limit = 100;
    let created = 0;
    for (let page = 1; page <= 200; page++) {
      const batch = await this.ocl.concepts('MOH-PPB', 'Investigations', page, limit);
      if (!batch.length) break;
      const rows = batch
        .filter((c) => (c.extras?.domain as string) === 'Laboratory' && !existing.has(c.id))
        .map((c) =>
          this.tests.create({
            facilityId,
            name: c.display_name || c.id,
            knhtsCode: c.id,
            loincCode: (c.extras?.loinc_code as string) || null,
            loincName: (c.extras?.loinc_long_name as string) || null,
            specimen: 'blood',
            department: (c.extras?.subdomain as string) || null,
            price: '0',
            analytes: [],
          }),
        );
      if (rows.length) {
        await this.tests.save(rows);
        rows.forEach((r) => existing.add(r.knhtsCode as string));
        created += rows.length;
      }
      if (batch.length < limit) break;
    }
    // Then give every LOINC-coded test its analytes from the LOINC panel
    // members (same background run; ranges stay for the facility to fill).
    await this.fillAnalytesFromLoinc(facilityId, { onlyEmpty: true });
    return created;
  }

  // ── Analyte templates from LOINC ────────────────────────────────────────────

  /**
   * Build a test's analyte template from LOINC via KNHTS: a panel's members
   * (`has-member` mappings) each become an analyte with the LOINC name, UCUM
   * unit, scale and code; a non-panel LOINC becomes a single analyte for the
   * test itself. Reference ranges are NOT in LOINC — left empty for the lab.
   */
  async analytesFromLoinc(loincCode: string, cache = new Map<string, OclConcept | null>()): Promise<LabAnalyte[]> {
    const concept = async (code: string) => {
      if (!cache.has(code)) cache.set(code, await this.ocl.lookup('Regenstrief', 'LOINC', code));
      return cache.get(code) ?? null;
    };
    const maps = await this.ocl.mappings('Regenstrief', 'LOINC', loincCode);
    const seen = new Set<string>();
    const memberCodes: string[] = [];
    for (const m of maps) {
      const t = (m.map_type ?? '').toLowerCase().replace(/[\s_]/g, '-');
      if (t !== 'has-member' && t !== 'has-element') continue;
      const code = m.to_concept_code;
      if (!code || code === loincCode || seen.has(code)) continue;
      seen.add(code);
      memberCodes.push(code);
    }
    const codes = memberCodes.length ? memberCodes : [loincCode];

    // OCL returns members in no clinical order; LOINC's COMMON_TEST_RANK (how
    // often the analyte is reported) puts Hb / WBC / platelets first.
    const built: { a: LabAnalyte; rank: number }[] = [];
    for (const code of codes) {
      const c = await concept(code);
      const x = (c?.extras ?? {}) as Record<string, unknown>;
      const str = (k: string) => (typeof x[k] === 'string' && (x[k] as string).trim() ? (x[k] as string).trim() : null);
      const a = new LabAnalyte();
      a.name = str('COMPONENT') || str('DisplayName') || c?.display_name || code;
      a.unit = str('EXAMPLE_UCUM_UNITS') || str('EXAMPLE_UNITS');
      a.scale = str('SCALE_TYP') || (c?.datatype ?? null);
      a.loincCode = code;
      a.refLow = null;
      a.refHigh = null;
      a.refText = null;
      const rank = Number(str('COMMON_TEST_RANK'));
      built.push({ a, rank: rank > 0 ? rank : Number.MAX_SAFE_INTEGER });
    }
    built.sort((p, q) => p.rank - q.rank || p.a.name.localeCompare(q.a.name));
    return built.map((b, i) => Object.assign(b.a, { sortOrder: i }));
  }

  /**
   * Replace one test's analytes with its LOINC template, keeping any reference
   * ranges the lab had already entered (matched by LOINC code, then by name).
   */
  async fillTestAnalytesFromLoinc(facilityId: string, testId: string, cache?: Map<string, OclConcept | null>): Promise<LabTest> {
    const test = await this.tests.findOne({ where: { id: testId, facilityId } });
    if (!test) throw new NotFoundException('Test not found');
    if (!test.loincCode) throw new BadRequestException('This test has no LOINC code to derive analytes from');
    const template = await this.analytesFromLoinc(test.loincCode, cache);
    const prev = test.analytes ?? [];
    const byLoinc = new Map(prev.filter((a) => a.loincCode).map((a) => [a.loincCode as string, a]));
    const byName = new Map(prev.map((a) => [a.name.trim().toLowerCase(), a]));
    for (const a of template) {
      const old = (a.loincCode && byLoinc.get(a.loincCode)) || byName.get(a.name.trim().toLowerCase());
      if (old) {
        a.refLow = old.refLow;
        a.refHigh = old.refHigh;
        a.refText = old.refText;
        if (old.unit) a.unit = old.unit;
      }
    }
    test.analytes = template; // cascade replaces
    return this.tests.save(test);
  }

  /**
   * Fill analytes for every LOINC-coded test in the facility (by default only
   * those with none yet). One KNHTS call per test + one per distinct member
   * concept, so it runs in the background over a few minutes for a full
   * national catalogue.
   */
  async fillAnalytesFromLoinc(facilityId: string, opts: { onlyEmpty?: boolean } = {}): Promise<{ tests: number; analytes: number }> {
    const all = await this.tests.find({ where: { facilityId } });
    const targets = all.filter((t) => t.loincCode && (!opts.onlyEmpty || !(t.analytes ?? []).length));
    const cache = new Map<string, OclConcept | null>();
    let tests = 0;
    let analytes = 0;
    for (const t of targets) {
      try {
        const saved = await this.fillTestAnalytesFromLoinc(facilityId, t.id, cache);
        tests += 1;
        analytes += saved.analytes?.length ?? 0;
      } catch (e) {
        this.logger.warn(`LOINC analytes for "${t.name}" (${t.loincCode}) failed: ${(e as Error).message}`);
      }
    }
    this.logger.log(`LOINC analytes: ${tests} tests, ${analytes} analytes`);
    return { tests, analytes };
  }

  async createTest(facilityId: string, dto: CreateLabTestDto): Promise<LabTest> {
    const test = this.tests.create({
      facilityId,
      code: dto.code ?? null,
      name: dto.name.trim(),
      knhtsCode: dto.knhtsCode ?? null,
      loincCode: dto.loincCode ?? null,
      loincName: dto.loincName ?? null,
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
    analyte.loincCode = a.loincCode?.trim() || null;
    analyte.scale = a.scale?.trim() || null;
    analyte.sortOrder = i;
    return analyte;
  }

  async updateTest(facilityId: string, id: string, dto: UpdateLabTestDto): Promise<LabTest> {
    const test = await this.tests.findOne({ where: { id, facilityId } });
    if (!test) throw new NotFoundException('Test not found');
    if (dto.code !== undefined) test.code = dto.code;
    if (dto.name !== undefined) test.name = dto.name.trim();
    if (dto.knhtsCode !== undefined) test.knhtsCode = dto.knhtsCode;
    if (dto.loincCode !== undefined) test.loincCode = dto.loincCode;
    if (dto.loincName !== undefined) test.loincName = dto.loincName;
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
      status: 'requested',
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
          item.status = 'requested';
          return item;
        }),
    });

    const saved = await this.orders.save(order);
    // Raise a bill per priced test when ordered against a visit — this posts the
    // revenue and gives the cashier a charge to collect. Best-effort: a billing
    // hiccup must never lose the lab order itself.
    if (saved.visitId) {
      for (const item of saved.items) {
        if (Number(item.price) <= 0) continue;
        try {
          const bill = await this.billing.create(
            {
              visitId: saved.visitId,
              serviceType: ServiceType.LAB,
              serviceDescription: `Lab: ${item.testName}`,
              amount: Number(item.price),
            },
            facilityId,
          );
          item.billingId = bill.id;
          await this.items.save(item);
        } catch (e) {
          console.error(`Lab bill for "${item.testName}" failed: ${(e as Error).message}`);
        }
      }
    }
    return this.getOrder(facilityId, saved.id);
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
      status = (Object.keys(STAGE) as LabStatus[]).find((k) => STAGE[k] === min) ?? 'requested';
    }
    if (order.status !== status) {
      order.status = status;
      await this.orders.save(order);
    }
  }

  /** Sample collected → straight into the lab (collection and analysis are one stage). */
  async collect(facilityId: string, orderId: string, itemId: string, user: CurrentUserType, dto: CollectSampleDto) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'requested') throw new BadRequestException('Sample already collected for this test');
    item.status = 'in_lab';
    item.collectedById = user.id;
    item.collectedByName = this.fullName(user);
    item.collectedAt = new Date();
    item.startedAt = item.collectedAt;
    item.specimenNote = dto.specimenNote ?? null;
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  /**
   * Pre-analytical rejection (haemolysed, clotted, insufficient, mislabelled…):
   * the item returns to `requested` for re-collection, and the rejected
   * collection is kept on the item's history.
   */
  async rejectSample(facilityId: string, orderId: string, itemId: string, user: CurrentUserType, dto: RejectSampleDto) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'in_lab') throw new BadRequestException('Only a sample in the lab can be rejected');
    item.rejections = [
      ...(item.rejections ?? []),
      {
        at: new Date().toISOString(),
        byId: user.id ?? null,
        byName: this.fullName(user),
        reason: dto.reason.trim(),
        collectedAt: item.collectedAt ? item.collectedAt.toISOString() : null,
        collectedByName: item.collectedByName,
        specimenNote: item.specimenNote,
      },
    ];
    item.status = 'requested';
    item.collectedById = null;
    item.collectedByName = null;
    item.collectedAt = null;
    item.startedAt = null;
    item.specimenNote = null;
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  private buildValues(item: LabOrderItem, values: ResultValueDto[]): LabResultValue[] {
    return values.map((v, i) => {
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
  }

  /**
   * Enter results. Leaves the item awaiting review, or — with `release` — releases
   * it in the same step (a one-person lab has no separate reviewer; the two
   * signatures are still recorded, they just belong to the same person).
   */
  async submitResult(
    facilityId: string,
    orderId: string,
    itemId: string,
    user: CurrentUserType,
    dto: SubmitResultDto,
  ) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status === 'requested') {
      throw new BadRequestException('Collect the sample before entering results');
    }
    if (item.status === 'released') {
      throw new BadRequestException('These results are released — amend them instead');
    }
    if (item.status === 'cancelled') throw new BadRequestException('This test was cancelled');

    // Replace the result set (cascade delete-orphan not enabled, so clear first).
    await this.values.delete({ orderItemId: item.id });
    item.results = this.buildValues(item, dto.values);
    item.resultNote = dto.resultNote ?? null;
    item.resultedById = user.id;
    item.resultedByName = this.fullName(user);
    item.resultedAt = new Date();

    if (dto.release) {
      item.status = 'released';
      item.verifiedById = user.id;
      item.verifiedByName = this.fullName(user);
      item.verifiedAt = new Date();
    } else {
      item.status = 'awaiting_review';
    }

    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  /** Authorise entered results: they become final and visible to the clinician. */
  async release(facilityId: string, orderId: string, itemId: string, user: CurrentUserType) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'awaiting_review') throw new BadRequestException('Enter results before releasing');
    item.status = 'released';
    item.verifiedById = user.id;
    item.verifiedByName = this.fullName(user);
    item.verifiedAt = new Date();
    await this.items.save(item);
    await this.syncOrderStatus(orderId);
    return this.getOrder(facilityId, orderId);
  }

  /**
   * Correct a released result. The superseded values, note and signatures are
   * kept on the item with the reason; the item stays released (FHIR `amended`).
   */
  async amend(facilityId: string, orderId: string, itemId: string, user: CurrentUserType, dto: AmendResultDto) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status !== 'released') throw new BadRequestException('Only released results can be amended');
    item.amendments = [
      ...(item.amendments ?? []),
      {
        at: new Date().toISOString(),
        byId: user.id ?? null,
        byName: this.fullName(user),
        reason: dto.reason.trim(),
        previous: {
          resultNote: item.resultNote,
          resultedAt: item.amendedAt ? item.amendedAt.toISOString() : item.resultedAt ? item.resultedAt.toISOString() : null,
          resultedByName: item.amendedByName ?? item.resultedByName,
          values: (item.results ?? []).map((v) => ({
            analyteName: v.analyteName,
            value: v.value,
            unit: v.unit,
            flag: v.flag,
            refLow: v.refLow,
            refHigh: v.refHigh,
            refText: v.refText,
          })),
        },
      },
    ];
    await this.values.delete({ orderItemId: item.id });
    item.results = this.buildValues(item, dto.values);
    if (dto.resultNote !== undefined) item.resultNote = dto.resultNote ?? null;
    item.amendedById = user.id;
    item.amendedByName = this.fullName(user);
    item.amendedAt = new Date();
    await this.items.save(item);
    return this.getOrder(facilityId, orderId);
  }

  async cancelItem(facilityId: string, orderId: string, itemId: string) {
    const { item } = await this.loadItem(facilityId, orderId, itemId);
    if (item.status === 'released') throw new BadRequestException('Cannot cancel a released test');
    // Drop the charge if it hasn't been paid yet (best-effort — a paid bill is
    // left in place for the till to reconcile / refund).
    if (item.billingId) {
      try {
        await this.billing.deleteBill(item.billingId, facilityId);
        item.billingId = null;
      } catch {
        /* paid or already gone — leave it */
      }
    }
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
      .andWhere('i.status = :released', { released: 'released' })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('r.sortOrder', 'ASC')
      .getMany();

    const trends: Record<string, { date: Date; value: number; unit: string | null; flag: LabFlag | null }[]> = {};
    for (const o of orders) {
      for (const it of o.items ?? []) {
        if (it.status !== 'released') continue;
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

  // ── LAB LEDGER ─────────────────────────────────────────────────────────────
  // Every test, flattened to one row with its workflow milestones (ordered →
  // collected → resulted → released/verified) and the charge it raised. Bounded
  // by an order-date range, optionally narrowed to one patient or one stage.
  async labLedger(
    facilityId: string,
    from?: Date,
    to?: Date,
    patientId?: string,
    status?: LabStatus,
  ): Promise<LabLedger> {
    const qb = this.items
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .where('o.facilityId = :facilityId', { facilityId })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('i.testName', 'ASC');

    if (from) qb.andWhere('o.createdAt >= :from', { from });
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      qb.andWhere('o.createdAt <= :to', { to: toEnd });
    }
    if (patientId) qb.andWhere('o.patientId = :patientId', { patientId });
    if (status) qb.andWhere('i.status = :status', { status });

    const items = await qb.getMany();

    const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
    const summary = { ordered: 0, collected: 0, resulted: 0, released: 0, cancelled: 0, charge: 0 };

    const rows: LabLedgerRow[] = items.map((i) => {
      const o = i.order;
      const charge = Number(i.price) || 0;
      if (i.status === 'cancelled') summary.cancelled += 1;
      else {
        summary.ordered += 1;
        summary.charge += charge;
        if (i.collectedAt) summary.collected += 1;
        if (i.resultedAt) summary.resulted += 1;
        if (i.status === 'released') summary.released += 1;
      }
      return {
        orderId: o.id,
        itemId: i.id,
        orderNo: o.orderNo,
        orderedAt: iso(o.createdAt),
        patientId: o.patientId,
        patientName: o.patientName || '—',
        patientNo: o.patientNo ?? null,
        testName: i.testName,
        department: i.department ?? null,
        orderedBy: o.orderedByName ?? null,
        collectedAt: iso(i.collectedAt),
        collectedBy: i.collectedByName ?? null,
        resultedAt: iso(i.resultedAt),
        resultedBy: i.resultedByName ?? null,
        releasedAt: iso(i.verifiedAt ?? i.resultedAt),
        status: i.status,
        charge: Math.round(charge * 100) / 100,
      };
    });

    summary.charge = Math.round(summary.charge * 100) / 100;
    return { summary, rows };
  }
}
