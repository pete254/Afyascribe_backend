import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { Birth } from './entities/birth.entity';
import { LabourObservation } from './entities/labour-observation.entity';
import { Pregnancy } from './entities/pregnancy.entity';
import { BirthDto, LabourObservationDto, OpenDeliveryDto, UpdateDeliveryDto } from './dto/labour.dto';
import { CervixAlert, LabourAlert, alertsFor, cervixAlert, partographLines } from './labour';
import { LCG_HOURS, LCG_ROWS, LCG_SOURCE, PARTOGRAPH_LEGACY } from './data/labour-care-guide';
import { BirthOutcome, LabourTool, PregnancyOutcome } from './maternity.enums';
import { gestationOn } from './gestation';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const nowIso = () => new Date().toISOString();
const dateOnly = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

export interface LabourChart {
  delivery: Delivery;
  observations: LabourObservation[];
  births: Birth[];
  /** Which rows are currently in alert, and why. */
  alerts: LabourAlert[];
  /** Whether labour has stalled by the guide's lag time. */
  cervix: CervixAlert | null;
  /** The guide's rows, so the chart draws itself from one definition. */
  rows: typeof LCG_ROWS;
  source: typeof LCG_SOURCE;
  /** Drawn only when the partograph view is asked for; never a reason to act. */
  partograph: {
    alert: { at: string; cm: number }[];
    action: { at: string; cm: number }[];
    note: string;
  } | null;
  /** The guide covers twelve hours; past that a fresh one is started. */
  hours: number;
}

@Injectable()
export class LabourService {
  constructor(
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(Birth) private readonly births: Repository<Birth>,
    @InjectRepository(LabourObservation) private readonly observations: Repository<LabourObservation>,
    @InjectRepository(Pregnancy) private readonly pregnancies: Repository<Pregnancy>,
  ) {}

  private name(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  private async requireDelivery(facilityId: string, id: string): Promise<Delivery> {
    const d = await this.deliveries.findOne({ where: { id, facilityId } });
    if (!d) throw new NotFoundException('Delivery not found');
    return d;
  }

  // ── Opening the record ────────────────────────────────────────────────────

  /** Open the labour record for a pregnancy, once. */
  async open(facilityId: string, dto: OpenDeliveryDto, user?: CurrentUserType): Promise<Delivery> {
    const pregnancy = await this.pregnancies.findOne({ where: { id: dto.pregnancyId, facilityId } });
    if (!pregnancy) throw new NotFoundException('Pregnancy not found');

    const existing = await this.deliveries.findOne({ where: { facilityId, pregnancyId: pregnancy.id } });
    if (existing) {
      throw new BadRequestException('This pregnancy already has a labour record');
    }

    return this.deliveries.save(
      this.deliveries.create({
        facilityId,
        pregnancyId: pregnancy.id,
        patientId: pregnancy.patientId,
        visitId: dto.visitId ?? null,
        admittedAt: dto.admittedAt ? new Date(dto.admittedAt) : new Date(),
        referredIn: dto.referredIn ?? false,
        referredFrom: dto.referredFrom?.trim() || null,
        labourOnset: (dto.labourOnset ?? null) as Delivery['labourOnset'],
        labourOnsetAt: dto.labourOnsetAt ? new Date(dto.labourOnsetAt) : null,
        activeLabourAt: dto.activeLabourAt ? new Date(dto.activeLabourAt) : null,
        membranesRupturedAt: dto.membranesRupturedAt ? new Date(dto.membranesRupturedAt) : null,
        riskFactors: dto.riskFactors?.trim() || null,
        complications: [],
        recordedById: user?.id ?? null,
        recordedByName: this.name(user),
      }),
    );
  }

  async update(facilityId: string, id: string, dto: UpdateDeliveryDto): Promise<Delivery> {
    const d = await this.requireDelivery(facilityId, id);
    const when = (v?: string) => (v === undefined ? undefined : v ? new Date(v) : null);

    Object.assign(d, {
      admittedAt: when(dto.admittedAt) ?? d.admittedAt,
      referredIn: dto.referredIn ?? d.referredIn,
      referredFrom: dto.referredFrom === undefined ? d.referredFrom : dto.referredFrom.trim() || null,
      labourOnset: (dto.labourOnset ?? d.labourOnset) as Delivery['labourOnset'],
      labourOnsetAt: when(dto.labourOnsetAt) ?? d.labourOnsetAt,
      activeLabourAt: when(dto.activeLabourAt) ?? d.activeLabourAt,
      membranesRupturedAt: when(dto.membranesRupturedAt) ?? d.membranesRupturedAt,
      riskFactors: dto.riskFactors === undefined ? d.riskFactors : dto.riskFactors.trim() || null,
      deliveredAt: when(dto.deliveredAt) ?? d.deliveredAt,
      deliveryMode: (dto.deliveryMode ?? d.deliveryMode) as Delivery['deliveryMode'],
      gestationWeeks: dto.gestationWeeks ?? d.gestationWeeks,
      perineum: (dto.perineum ?? d.perineum) as Delivery['perineum'],
      perineumRepaired: dto.perineumRepaired ?? d.perineumRepaired,
      amtslGiven: dto.amtslGiven ?? d.amtslGiven,
      bloodLossMl: dto.bloodLossMl ?? d.bloodLossMl,
      placentaComplete: dto.placentaComplete ?? d.placentaComplete,
      complications: dto.complications ?? d.complications,
      conductedByName: dto.conductedByName === undefined ? d.conductedByName : dto.conductedByName.trim() || null,
      maternalOutcome: (dto.maternalOutcome ?? d.maternalOutcome) as Delivery['maternalOutcome'],
      maternalDischargedAt: when(dto.maternalDischargedAt) ?? d.maternalDischargedAt,
      maternalDeathCause:
        dto.maternalDeathCause === undefined ? d.maternalDeathCause : dto.maternalDeathCause.trim() || null,
      notes: dto.notes === undefined ? d.notes : dto.notes.trim() || null,
    });

    // Gestation at delivery is worked out from the pregnancy's own dating
    // rather than typed, unless the clinician has said otherwise.
    if (d.deliveredAt && d.gestationWeeks == null) {
      const pregnancy = await this.pregnancies.findOne({ where: { id: d.pregnancyId, facilityId } });
      const g = pregnancy ? gestationOn(pregnancy, dateOnly(d.deliveredAt)!) : null;
      if (g) d.gestationWeeks = g.weeks;
    }

    return this.deliveries.save(d);
  }

  // ── The chart ─────────────────────────────────────────────────────────────

  async chart(facilityId: string, deliveryId: string, tool: LabourTool = 'labour-care-guide'): Promise<LabourChart> {
    const delivery = await this.requireDelivery(facilityId, deliveryId);
    const [observations, births] = await Promise.all([
      this.observations.find({ where: { facilityId, deliveryId }, order: { observedAt: 'ASC' } }),
      this.births.find({ where: { facilityId, deliveryId }, order: { birthOrder: 'ASC' } }),
    ]);

    const latest = observations[observations.length - 1];
    const alerts = latest ? alertsFor(this.valuesOf(latest)) : [];

    const readings = observations
      .filter((o) => o.cervix != null)
      .map((o) => ({ at: new Date(o.observedAt).toISOString(), cervix: Number(o.cervix) }));

    // Once she has delivered the clock stops; a finished labour is not stalled.
    const asOf = delivery.deliveredAt ? new Date(delivery.deliveredAt).toISOString() : nowIso();
    const cervix = delivery.deliveredAt ? null : cervixAlert(readings, asOf);

    // The partograph's lines need a start; without an active-phase time there
    // is nothing honest to draw them from.
    const start = delivery.activeLabourAt ?? delivery.admittedAt;
    const partograph =
      tool === 'partograph' && start
        ? { ...partographLines(new Date(start).toISOString(), LCG_HOURS), note: PARTOGRAPH_LEGACY.note }
        : null;

    return {
      delivery,
      observations,
      births,
      alerts,
      cervix,
      rows: LCG_ROWS,
      source: LCG_SOURCE,
      partograph,
      hours: LCG_HOURS,
    };
  }

  /** The entity's columns as the guide's rows, for the alert rules. */
  private valuesOf(o: LabourObservation) {
    return {
      companion: o.companion,
      painRelief: o.painRelief,
      oralFluid: o.oralFluid,
      posture: o.posture,
      baselineFhr: o.baselineFhr,
      fhrDeceleration: o.fhrDeceleration,
      amnioticFluid: o.amnioticFluid,
      fetalPosition: o.fetalPosition,
      caput: o.caput,
      moulding: o.moulding,
      pulse: o.pulse,
      systolic: o.systolic,
      diastolic: o.diastolic,
      temperature: o.temperature == null ? null : Number(o.temperature),
      urine: o.urine,
      contractionsPer10: o.contractionsPer10,
      contractionDuration: o.contractionDuration,
      cervix: o.cervix == null ? null : Number(o.cervix),
      descent: o.descent,
    };
  }

  async observe(
    facilityId: string,
    deliveryId: string,
    dto: LabourObservationDto,
    user?: CurrentUserType,
  ): Promise<{ observation: LabourObservation; alerts: LabourAlert[] }> {
    const delivery = await this.requireDelivery(facilityId, deliveryId);
    if (delivery.deliveredAt) {
      throw new BadRequestException('This labour has ended — its chart cannot be added to');
    }
    if (new Date(dto.observedAt).getTime() > Date.now() + 60_000) {
      throw new BadRequestException('An observation cannot be recorded in the future');
    }

    const alerts = alertsFor({ ...dto, temperature: dto.temperature ?? null });

    const observation = await this.observations.save(
      this.observations.create({
        facilityId,
        deliveryId,
        observedAt: new Date(dto.observedAt),
        companion: dto.companion ?? null,
        painRelief: dto.painRelief ?? null,
        oralFluid: dto.oralFluid ?? null,
        posture: dto.posture ?? null,
        baselineFhr: dto.baselineFhr ?? null,
        fhrDeceleration: dto.fhrDeceleration ?? null,
        amnioticFluid: dto.amnioticFluid ?? null,
        fetalPosition: dto.fetalPosition ?? null,
        caput: dto.caput ?? null,
        moulding: dto.moulding ?? null,
        pulse: dto.pulse ?? null,
        systolic: dto.systolic ?? null,
        diastolic: dto.diastolic ?? null,
        temperature: dto.temperature != null ? String(dto.temperature) : null,
        urine: dto.urine ?? null,
        contractionsPer10: dto.contractionsPer10 ?? null,
        contractionDuration: dto.contractionDuration ?? null,
        cervix: dto.cervix != null ? String(dto.cervix) : null,
        descent: dto.descent ?? null,
        oxytocin: dto.oxytocin?.trim() || null,
        medicine: dto.medicine?.trim() || null,
        ivFluids: dto.ivFluids?.trim() || null,
        assessment: dto.assessment?.trim() || null,
        plan: dto.plan?.trim() || null,
        alerts: alerts.map((a) => a.key),
        recordedById: user?.id ?? null,
        recordedByName: this.name(user),
      }),
    );

    return { observation, alerts };
  }

  async removeObservation(facilityId: string, id: string): Promise<void> {
    const row = await this.observations.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Observation not found');
    await this.observations.remove(row);
  }

  // ── Babies ────────────────────────────────────────────────────────────────

  /**
   * Record a baby. The last one recorded closes the pregnancy: its outcome
   * follows the babies, so a stillbirth is never filed as a live birth.
   */
  async recordBirth(facilityId: string, deliveryId: string, dto: BirthDto): Promise<Birth> {
    const delivery = await this.requireDelivery(facilityId, deliveryId);
    const existing = await this.births.find({ where: { facilityId, deliveryId } });

    const order = dto.birthOrder ?? existing.length + 1;
    if (existing.some((b) => b.birthOrder === order)) {
      throw new BadRequestException(`Baby ${order} is already recorded for this delivery`);
    }

    const birth = await this.births.save(
      this.births.create({
        facilityId,
        deliveryId,
        pregnancyId: delivery.pregnancyId,
        motherPatientId: delivery.patientId,
        babyPatientId: dto.babyPatientId ?? null,
        birthOrder: order,
        bornAt: dto.bornAt ? new Date(dto.bornAt) : (delivery.deliveredAt ?? new Date()),
        outcome: dto.outcome as BirthOutcome,
        sex: dto.sex?.trim() || null,
        birthWeightGrams: dto.birthWeightGrams ?? null,
        apgar1: dto.apgar1 ?? null,
        apgar5: dto.apgar5 ?? null,
        apgar10: dto.apgar10 ?? null,
        resuscitated: dto.resuscitated ?? false,
        breastfedWithinHour: dto.breastfedWithinHour ?? null,
        chlorhexidineCordCare: dto.chlorhexidineCordCare ?? false,
        vitaminKGiven: dto.vitaminKGiven ?? false,
        eyeProphylaxisGiven: dto.eyeProphylaxisGiven ?? false,
        congenitalAnomaly: dto.congenitalAnomaly?.trim() || null,
        dischargeStatus: (dto.dischargeStatus ?? null) as Birth['dischargeStatus'],
        dischargedAt: dto.dischargedAt ? new Date(dto.dischargedAt) : null,
        referredTo: dto.referredTo?.trim() || null,
        birthNotified: dto.birthNotified ?? false,
        birthNotificationNo: dto.birthNotificationNo?.trim() || null,
        notes: dto.notes?.trim() || null,
      }),
    );

    await this.syncPregnancyOutcome(facilityId, delivery);
    return birth;
  }

  async updateBirth(facilityId: string, id: string, dto: BirthDto): Promise<Birth> {
    const b = await this.births.findOne({ where: { id, facilityId } });
    if (!b) throw new NotFoundException('Birth not found');
    const when = (v?: string) => (v === undefined ? undefined : v ? new Date(v) : null);

    Object.assign(b, {
      bornAt: when(dto.bornAt) ?? b.bornAt,
      outcome: (dto.outcome ?? b.outcome) as BirthOutcome,
      sex: dto.sex === undefined ? b.sex : dto.sex.trim() || null,
      birthWeightGrams: dto.birthWeightGrams ?? b.birthWeightGrams,
      apgar1: dto.apgar1 ?? b.apgar1,
      apgar5: dto.apgar5 ?? b.apgar5,
      apgar10: dto.apgar10 ?? b.apgar10,
      resuscitated: dto.resuscitated ?? b.resuscitated,
      breastfedWithinHour: dto.breastfedWithinHour ?? b.breastfedWithinHour,
      chlorhexidineCordCare: dto.chlorhexidineCordCare ?? b.chlorhexidineCordCare,
      vitaminKGiven: dto.vitaminKGiven ?? b.vitaminKGiven,
      eyeProphylaxisGiven: dto.eyeProphylaxisGiven ?? b.eyeProphylaxisGiven,
      congenitalAnomaly:
        dto.congenitalAnomaly === undefined ? b.congenitalAnomaly : dto.congenitalAnomaly.trim() || null,
      dischargeStatus: (dto.dischargeStatus ?? b.dischargeStatus) as Birth['dischargeStatus'],
      dischargedAt: when(dto.dischargedAt) ?? b.dischargedAt,
      referredTo: dto.referredTo === undefined ? b.referredTo : dto.referredTo.trim() || null,
      birthNotified: dto.birthNotified ?? b.birthNotified,
      birthNotificationNo:
        dto.birthNotificationNo === undefined ? b.birthNotificationNo : dto.birthNotificationNo.trim() || null,
      babyPatientId: dto.babyPatientId ?? b.babyPatientId,
      notes: dto.notes === undefined ? b.notes : dto.notes.trim() || null,
    });

    const saved = await this.births.save(b);
    const delivery = await this.deliveries.findOne({ where: { id: b.deliveryId, facilityId } });
    if (delivery) await this.syncPregnancyOutcome(facilityId, delivery);
    return saved;
  }

  async removeBirth(facilityId: string, id: string): Promise<void> {
    const b = await this.births.findOne({ where: { id, facilityId } });
    if (!b) throw new NotFoundException('Birth not found');
    await this.births.remove(b);
  }

  /**
   * Close the pregnancy from what the babies say.
   *
   * A live birth anywhere in the set makes it a live birth — postnatal care
   * for the mother follows either way, but the distinction decides whether
   * there is a baby to follow up.
   */
  private async syncPregnancyOutcome(facilityId: string, delivery: Delivery): Promise<void> {
    const births = await this.births.find({ where: { facilityId, deliveryId: delivery.id } });
    if (!births.length) return;

    const pregnancy = await this.pregnancies.findOne({ where: { id: delivery.pregnancyId, facilityId } });
    if (!pregnancy) return;

    const anyLive = births.some((b) => b.outcome === 'live-birth');
    const outcome: PregnancyOutcome = anyLive ? 'live-birth' : 'stillbirth';
    const outcomeDate =
      dateOnly(delivery.deliveredAt) ?? dateOnly(births[0].bornAt) ?? new Date().toISOString().slice(0, 10);

    pregnancy.status = 'ended';
    pregnancy.outcome = outcome;
    pregnancy.outcomeDate = outcomeDate;
    pregnancy.deliveryMode = delivery.deliveryMode ?? pregnancy.deliveryMode;
    pregnancy.babiesBorn = births.length;
    await this.pregnancies.save(pregnancy);
  }

  async forPregnancy(facilityId: string, pregnancyId: string): Promise<Delivery | null> {
    return this.deliveries.findOne({ where: { facilityId, pregnancyId } });
  }
}
