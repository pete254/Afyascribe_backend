import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prescription } from './entities/prescription.entity';
import { PrescriptionItem } from './entities/prescription-item.entity';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionItemsDto,
  PharmacyItemDto,
} from './dto/prescription.dto';
import { CurrentUserType } from '../common/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { StockService } from '../inventory/stock.service';
import { ServiceType } from '../billing/entities/billing.entity';
import { PatientVisit } from '../patient-visits/entities/patient-visit.entity';
import { Patient } from '../patients/entities/patient.entity';

/** Age in whole years from a date-of-birth string, or null. */
function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectRepository(Prescription) private readonly rx: Repository<Prescription>,
    @InjectRepository(PrescriptionItem) private readonly lines: Repository<PrescriptionItem>,
    @InjectRepository(PatientVisit) private readonly visits: Repository<PatientVisit>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly billing: BillingService,
    private readonly stock: StockService,
  ) {}

  private fullName(u: CurrentUserType): string {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  }

  private async nextRxNo(facilityId: string): Promise<string> {
    const n = await this.rx.count({ where: { facilityId } });
    return `RX-${String(n + 1).padStart(5, '0')}`;
  }

  // ── Doctor writes a prescription ────────────────────────────────────────────
  async create(facilityId: string, user: CurrentUserType, dto: CreatePrescriptionDto): Promise<Prescription> {
    const items = (dto.items ?? []).filter((i) => i.medication?.trim());
    if (items.length === 0) throw new BadRequestException('Add at least one medication');

    const rx = this.rx.create({
      facilityId,
      rxNo: await this.nextRxNo(facilityId),
      patientId: dto.patientId,
      patientName: dto.patientName ?? null,
      patientNo: dto.patientNo ?? null,
      visitId: dto.visitId ?? null,
      doctorId: user.id,
      doctorName: this.fullName(user),
      doctorNo: user.practitionerNo ?? null,
      diagnosis: dto.diagnosis ?? null,
      notes: dto.notes ?? null,
      status: 'pending',
      items: items.map((i, idx) => {
        const line = new PrescriptionItem();
        line.medication = i.medication.trim();
        line.dosage = i.dosage ?? null;
        line.frequency = i.frequency ?? null;
        line.form = i.form ?? null;
        line.duration = i.duration ?? null;
        line.quantityText = i.quantityText ?? null;
        line.instructions = i.instructions ?? null;
        line.sortOrder = idx;
        line.dispensed = false;
        return line;
      }),
    });
    const saved = await this.rx.save(rx);
    return this.getOne(facilityId, saved.id);
  }

  // ── Queue / lists ───────────────────────────────────────────────────────────
  listQueue(
    facilityId: string,
    filter: { status?: string; patientId?: string; visitId?: string } = {},
  ): Promise<Prescription[]> {
    const qb = this.rx
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.items', 'i')
      .where('p.facilityId = :facilityId', { facilityId });
    if (filter.status) qb.andWhere('p.status = :status', { status: filter.status });
    if (filter.patientId) qb.andWhere('p.patientId = :patientId', { patientId: filter.patientId });
    if (filter.visitId) qb.andWhere('p.visitId = :visitId', { visitId: filter.visitId });
    return qb.orderBy('p.createdAt', 'DESC').addOrderBy('i.sortOrder', 'ASC').getMany();
  }

  /** How many prescriptions are waiting in the pharmacy queue (sidebar badge). */
  async pendingCount(facilityId: string): Promise<{ count: number }> {
    const count = await this.rx.count({ where: { facilityId, status: 'pending' } });
    return { count };
  }

  async getOne(facilityId: string, id: string): Promise<Prescription> {
    const rx = await this.rx.findOne({ where: { id, facilityId } });
    if (!rx) throw new NotFoundException('Prescription not found');
    (rx.items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

    // Attach the patient's vitals (from this visit's triage) and age so the
    // pharmacist can do weight/age-based dosage calculations. Non-persisted
    // fields on the returned instance; best-effort.
    try {
      const visit = rx.visitId
        ? await this.visits.findOne({ where: { id: rx.visitId, facilityId } })
        : null;
      const patient = rx.patientId
        ? await this.patients.findOne({ where: { id: rx.patientId, facilityId } })
        : null;
      const extra = rx as unknown as Record<string, unknown>;
      extra.vitals = visit?.triageData ?? null;
      extra.patientDob = patient?.dateOfBirth ?? null;
      extra.patientAge = ageFrom(patient?.dateOfBirth);
      extra.patientSex = patient?.gender ?? null;
    } catch {
      /* vitals are a convenience — never fail the fetch over them */
    }
    return rx;
  }

  // ── Pharmacist edits: link lines to stock, price them ───────────────────────
  async updateItems(facilityId: string, id: string, dto: UpdatePrescriptionItemsDto): Promise<Prescription> {
    const rx = await this.getOne(facilityId, id);
    if (rx.status === 'dispensed') throw new BadRequestException('This prescription has already been dispensed');
    if (rx.status === 'cancelled') throw new BadRequestException('This prescription was cancelled');

    if (dto.notes !== undefined) rx.notes = dto.notes;

    const existing = new Map((rx.items ?? []).map((l) => [l.id, l]));
    const kept = new Set<string>();

    const next: PrescriptionItem[] = (dto.items ?? []).map((d: PharmacyItemDto, idx) => {
      const line = (d.id && existing.get(d.id)) || new PrescriptionItem();
      if (d.id && existing.has(d.id)) kept.add(d.id);
      line.prescriptionId = rx.id;
      line.medication = d.medication.trim();
      line.dosage = d.dosage ?? null;
      line.frequency = d.frequency ?? null;
      line.form = d.form ?? null;
      line.duration = d.duration ?? null;
      line.quantityText = d.quantityText ?? null;
      line.instructions = d.instructions ?? null;
      line.itemId = d.itemId ?? null;
      line.dispenseQty = d.dispenseQty != null ? String(d.dispenseQty) : null;
      line.unitPrice = d.unitPrice != null ? String(d.unitPrice) : null;
      line.sortOrder = idx;
      return line;
    });

    // Remove lines the pharmacist dropped — but never a line already billed or
    // dispensed (its money/stock movement must stay traceable).
    const removed = (rx.items ?? []).filter(
      (l) => !kept.has(l.id) && !l.billingId && !l.dispensed,
    );
    if (removed.length) await this.lines.remove(removed);

    // Preserve billed/dispensed lines that were not resubmitted.
    const protectedLines = (rx.items ?? []).filter(
      (l) => !kept.has(l.id) && (l.billingId || l.dispensed),
    );

    await this.lines.save(next);
    rx.items = [...next, ...protectedLines];
    await this.rx.save(rx);
    return this.getOne(facilityId, id);
  }

  // ── Send priced lines to billing (no stock movement yet) ────────────────────
  async sendToBilling(facilityId: string, id: string): Promise<Prescription> {
    const rx = await this.getOne(facilityId, id);
    if (!rx.visitId) {
      throw new BadRequestException('This prescription is not linked to a visit, so it cannot be billed');
    }
    if (rx.status !== 'pending') throw new BadRequestException('Only a pending prescription can be billed');

    for (const line of rx.items ?? []) {
      const qty = Number(line.dispenseQty);
      const price = Number(line.unitPrice);
      if (line.billingId || !line.itemId || !(qty > 0) || !(price > 0)) continue;
      try {
        // No itemId on the bill: stock is depleted only at dispense-time, so
        // money is collected before the medicine leaves the shelf.
        const bill = await this.billing.create(
          {
            visitId: rx.visitId,
            serviceType: ServiceType.PHARMACY,
            serviceDescription: `Drug: ${line.medication}`,
            amount: Math.round(qty * price * 100) / 100,
          },
          facilityId,
        );
        line.billingId = bill.id;
        await this.lines.save(line);
      } catch (e) {
        console.error(`Pharmacy bill for "${line.medication}" failed: ${(e as Error).message}`);
      }
    }
    return this.getOne(facilityId, id);
  }

  // ── Dispense: deplete stock, hand medicine over ─────────────────────────────
  async dispense(facilityId: string, user: CurrentUserType, id: string): Promise<Prescription> {
    const rx = await this.getOne(facilityId, id);
    if (rx.status === 'dispensed') throw new BadRequestException('Already dispensed');
    if (rx.status === 'cancelled') throw new BadRequestException('This prescription was cancelled');

    const toDispense = (rx.items ?? []).filter(
      (l) => l.itemId && Number(l.dispenseQty) > 0 && !l.dispensed,
    );
    if (toDispense.length === 0) {
      throw new BadRequestException('Link at least one line to a stock item with a quantity before dispensing');
    }

    let dispensedAny = false;
    for (const line of toDispense) {
      // issueStock locks the item row and caps to on-hand stock atomically, so
      // even two pharmacists dispensing the same item at once can't overdraw:
      // the first takes what it can, the second only gets what's left. Any
      // shortfall stays unfilled for the patient to source externally.
      try {
        const { issued } = await this.stock.issueStock(
          facilityId,
          line.itemId!,
          Number(line.dispenseQty),
          {
            capToStock: true,
            sourceType: 'prescription_dispense',
            sourceId: rx.id,
            costCenter: 'pharmacy',
            note: `Dispensed: ${line.medication}`,
            userId: user.id,
          },
        );
        if (issued > 0) {
          // Record what was actually handed over.
          line.dispenseQty = String(issued);
          line.dispensed = true;
          await this.lines.save(line);
          dispensedAny = true;
        }
      } catch (e) {
        console.error(`Dispense of "${line.medication}" failed: ${(e as Error).message}`);
        throw new BadRequestException(
          `Could not dispense "${line.medication}": ${(e as Error).message}`,
        );
      }
    }

    if (!dispensedAny) {
      throw new BadRequestException('None of the linked items had stock left to dispense');
    }

    rx.status = 'dispensed';
    rx.dispensedById = user.id;
    rx.dispensedByName = this.fullName(user);
    rx.dispensedAt = new Date();
    await this.rx.save(rx);
    return this.getOne(facilityId, id);
  }

  async cancel(facilityId: string, id: string): Promise<Prescription> {
    const rx = await this.getOne(facilityId, id);
    if (rx.status === 'dispensed') throw new BadRequestException('Cannot cancel a dispensed prescription');
    // Drop any unpaid bills raised for its lines (best-effort).
    for (const line of rx.items ?? []) {
      if (line.billingId) {
        try {
          await this.billing.deleteBill(line.billingId, facilityId);
          line.billingId = null;
          await this.lines.save(line);
        } catch {
          /* paid or gone — leave it */
        }
      }
    }
    rx.status = 'cancelled';
    await this.rx.save(rx);
    return this.getOne(facilityId, id);
  }
}
