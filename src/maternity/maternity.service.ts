import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Pregnancy } from './entities/pregnancy.entity';
import { AncContact } from './entities/anc-contact.entity';
import { PncContact } from './entities/pnc-contact.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Immunisation } from '../immunisation/entities/immunisation.entity';
import {
  AncContactDto,
  PncContactDto,
  PregnancyOutcomeDto,
  ProfileDto,
  StartPregnancyDto,
  UpdatePregnancyDto,
} from './dto/maternity.dto';
import {
  AncContactStatus,
  PncContactStatus,
  anaemiaGrade,
  ancContactStatuses,
  bpFlag,
  gestationOn,
  pncContactStatuses,
  pncWindowFor,
  resolveDating,
} from './gestation';
import { ANC_SOURCE, PNC_CONTACTS, PNC_SOURCE, PNC_WINDOW_LABEL, PncWindow } from './data/schedules';
import { ANC_PROFILE, ANC_PROFILE_SOURCE, ProfileTest } from './data/profile';
import { OUTCOMES_WITH_PNC, PregnancyOutcome } from './maternity.enums';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/** A profile test that has a result, and the column it lives in. */
const PROFILE_COLUMN: Record<ProfileTest, keyof Pregnancy> = {
  hb: 'profileHb',
  bloodGroup: 'profileBloodGroup',
  urinalysis: 'profileUrinalysis',
  rbs: 'profileRbs',
  syphilis: 'profileSyphilis',
  hepB: 'profileHepB',
  hiv: 'profileHiv',
  tb: 'profileTb',
};

export interface PregnancyCard {
  pregnancy: Pregnancy;
  /** The EDD the record works from, and where it came from. */
  edd: string | null;
  datingBasis: string | null;
  gestation: { weeks: number; days: number; trimester: number; postTerm: boolean } | null;
  ancContacts: AncContactStatus[];
  contacts: AncContact[];
  pncContacts: PncContactStatus[];
  pncVisits: PncContact[];
  /** Which profile tests still have no result. */
  profileOutstanding: { test: string; label: string }[];
  /** Things worth a clinician's eye, worked out rather than typed. */
  flags: { kind: string; severity: 'info' | 'warning' | 'danger'; message: string }[];
  sources: { anc: typeof ANC_SOURCE; pnc: typeof PNC_SOURCE; profile: typeof ANC_PROFILE_SOURCE };
}

@Injectable()
export class MaternityService {
  constructor(
    @InjectRepository(Pregnancy) private readonly pregnancies: Repository<Pregnancy>,
    @InjectRepository(AncContact) private readonly ancContacts: Repository<AncContact>,
    @InjectRepository(PncContact) private readonly pncContacts: Repository<PncContact>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Immunisation) private readonly immunisations: Repository<Immunisation>,
  ) {}

  private fullName(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  private async requirePatient(facilityId: string, patientId: string): Promise<Patient> {
    const p = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  private async require(facilityId: string, id: string): Promise<Pregnancy> {
    const p = await this.pregnancies.findOne({ where: { id, facilityId } });
    if (!p) throw new NotFoundException('Pregnancy not found');
    return p;
  }

  /** The ANC clinic number the register uses: year, month, then the month's count. */
  private async nextAncNumber(facilityId: string, on: string): Promise<string> {
    const ym = on.slice(0, 7);
    const from = new Date(`${ym}-01T00:00:00Z`);
    // The first of the next month, so February does not need a 31st.
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const n = await this.pregnancies.count({ where: { facilityId, createdAt: Between(from, to) } });
    return `${ym}-${String(n + 1).padStart(4, '0')}`;
  }

  // ── Pregnancies ───────────────────────────────────────────────────────────

  async start(facilityId: string, dto: StartPregnancyDto, user?: CurrentUserType): Promise<Pregnancy> {
    await this.requirePatient(facilityId, dto.patientId);

    // Two open pregnancies for one woman is a data-entry slip, not a clinical
    // state — catching it here keeps contacts from landing on the wrong one.
    const open = await this.pregnancies.findOne({
      where: { facilityId, patientId: dto.patientId, status: 'active' },
    });
    if (open) {
      throw new BadRequestException(
        'This patient already has an open pregnancy. Record its outcome before starting another.',
      );
    }

    if (!dto.lmp && !dto.eddEntered && !(dto.ultrasoundDate && dto.ultrasoundGaDays != null)) {
      throw new BadRequestException(
        'A pregnancy needs a date to work from: the last period, a dating scan, or an expected date of delivery',
      );
    }
    if (dto.lmp && dto.lmp > today()) {
      throw new BadRequestException('The last menstrual period cannot be in the future');
    }

    return this.pregnancies.save(
      this.pregnancies.create({
        facilityId,
        patientId: dto.patientId,
        ancNumber: await this.nextAncNumber(facilityId, today()),
        lmp: dto.lmp ?? null,
        eddEntered: dto.eddEntered ?? null,
        ultrasoundDate: dto.ultrasoundDate ?? null,
        ultrasoundGaDays: dto.ultrasoundGaDays ?? null,
        gravida: dto.gravida ?? null,
        para: dto.para ?? null,
        livingChildren: dto.livingChildren ?? null,
        riskFactors: dto.riskFactors ?? [],
        note: dto.note?.trim() || null,
        status: 'active',
        recordedById: user?.id ?? null,
        recordedByName: this.fullName(user),
      }),
    );
  }

  async update(facilityId: string, id: string, dto: UpdatePregnancyDto): Promise<Pregnancy> {
    const p = await this.require(facilityId, id);
    Object.assign(p, {
      lmp: dto.lmp ?? p.lmp,
      eddEntered: dto.eddEntered ?? p.eddEntered,
      ultrasoundDate: dto.ultrasoundDate ?? p.ultrasoundDate,
      ultrasoundGaDays: dto.ultrasoundGaDays ?? p.ultrasoundGaDays,
      gravida: dto.gravida ?? p.gravida,
      para: dto.para ?? p.para,
      livingChildren: dto.livingChildren ?? p.livingChildren,
      riskFactors: dto.riskFactors ?? p.riskFactors,
      note: dto.note === undefined ? p.note : dto.note.trim() || null,
    });
    return this.pregnancies.save(p);
  }

  /** Results come back over days, so the profile is patched rather than replaced. */
  async saveProfile(facilityId: string, id: string, dto: ProfileDto): Promise<Pregnancy> {
    const p = await this.require(facilityId, id);
    if (dto.profileHb !== undefined) p.profileHb = String(dto.profileHb);
    if (dto.profileBloodGroup !== undefined) p.profileBloodGroup = dto.profileBloodGroup as Pregnancy['profileBloodGroup'];
    if (dto.profileUrinalysis !== undefined) p.profileUrinalysis = dto.profileUrinalysis.trim() || null;
    if (dto.profileRbs !== undefined) p.profileRbs = String(dto.profileRbs);
    if (dto.profileSyphilis !== undefined) p.profileSyphilis = dto.profileSyphilis as Pregnancy['profileSyphilis'];
    if (dto.profileHepB !== undefined) p.profileHepB = dto.profileHepB as Pregnancy['profileHepB'];
    if (dto.profileHiv !== undefined) p.profileHiv = dto.profileHiv as Pregnancy['profileHiv'];
    if (dto.profileTb !== undefined) p.profileTb = dto.profileTb as Pregnancy['profileTb'];
    p.profileDate = dto.profileDate ?? p.profileDate ?? today();
    return this.pregnancies.save(p);
  }

  async setOutcome(facilityId: string, id: string, dto: PregnancyOutcomeDto): Promise<Pregnancy> {
    const p = await this.require(facilityId, id);
    if (dto.outcomeDate > today()) {
      throw new BadRequestException('An outcome cannot be recorded in the future');
    }
    const dated = resolveDating(p);
    if (dated && p.lmp && dto.outcomeDate < p.lmp) {
      throw new BadRequestException('The outcome cannot be before the pregnancy began');
    }

    p.status = 'ended';
    p.outcome = dto.outcome as PregnancyOutcome;
    p.outcomeDate = dto.outcomeDate;
    p.deliveryMode = (dto.deliveryMode ?? null) as Pregnancy['deliveryMode'];
    p.placeOfBirth = dto.placeOfBirth?.trim() || null;
    p.babiesBorn = dto.babiesBorn ?? null;
    if (dto.note) p.note = dto.note.trim() || null;
    return this.pregnancies.save(p);
  }

  async listForPatient(facilityId: string, patientId: string): Promise<Pregnancy[]> {
    return this.pregnancies.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── The card a clinician reads ────────────────────────────────────────────

  async card(facilityId: string, id: string): Promise<PregnancyCard> {
    const pregnancy = await this.require(facilityId, id);
    const [contacts, pncVisits] = await Promise.all([
      this.ancContacts.find({ where: { facilityId, pregnancyId: id }, order: { contactNumber: 'ASC' } }),
      this.pncContacts.find({ where: { facilityId, pregnancyId: id }, order: { contactDate: 'ASC' } }),
    ]);

    const dated = resolveDating(pregnancy);
    const on = pregnancy.status === 'active' ? today() : (pregnancy.outcomeDate ?? today());
    const g = gestationOn(pregnancy, on);

    const ancStatuses = ancContactStatuses(
      pregnancy,
      contacts.map((c) => ({ contactNumber: c.contactNumber, contactDate: c.contactDate })),
      { endedOn: pregnancy.status === 'ended' ? pregnancy.outcomeDate : null },
    );

    // Postnatal care follows a birth, not every ending: there is no puerperium
    // to follow up after an early loss, and offering one would be careless.
    const pncEligible =
      pregnancy.status === 'ended' &&
      pregnancy.outcome != null &&
      OUTCOMES_WITH_PNC.includes(pregnancy.outcome) &&
      !!pregnancy.outcomeDate;

    const pncStatuses = pncEligible
      ? pncContactStatuses(
          pregnancy.outcomeDate!,
          pncVisits.map((v) => ({ window: v.window, contactDate: v.contactDate })),
        )
      : [];

    return {
      pregnancy,
      edd: dated?.edd ?? null,
      datingBasis: dated?.basis ?? null,
      gestation: g ? { weeks: g.weeks, days: g.days, trimester: g.trimester, postTerm: g.postTerm } : null,
      ancContacts: ancStatuses,
      contacts,
      pncContacts: pncStatuses,
      pncVisits,
      profileOutstanding: ANC_PROFILE.filter((t) => pregnancy[PROFILE_COLUMN[t.test]] == null).map((t) => ({
        test: t.test,
        label: t.label,
      })),
      flags: this.flagsFor(pregnancy, contacts, pncVisits),
      sources: { anc: ANC_SOURCE, pnc: PNC_SOURCE, profile: ANC_PROFILE_SOURCE },
    };
  }

  /**
   * What a clinician should be told without having to read every row: anaemia,
   * raised blood pressure, a positive screen, a pregnancy past its date.
   */
  private flagsFor(
    p: Pregnancy,
    contacts: AncContact[],
    pnc: PncContact[],
  ): PregnancyCard['flags'] {
    const flags: PregnancyCard['flags'] = [];

    const latestHb = num(contacts.at(-1)?.hb ?? null) ?? num(p.profileHb);
    const grade = anaemiaGrade(latestHb);
    if (grade && grade !== 'none') {
      flags.push({
        kind: 'anaemia',
        severity: grade === 'severe' ? 'danger' : 'warning',
        message: `${grade[0].toUpperCase()}${grade.slice(1)} anaemia — haemoglobin ${latestHb} g/dL`,
      });
    }

    const last = contacts.at(-1);
    const bp = bpFlag(last?.bpSystolic, last?.bpDiastolic);
    if (bp && bp !== 'normal') {
      flags.push({
        kind: 'blood-pressure',
        severity: bp === 'severe' ? 'danger' : 'warning',
        message: `${bp === 'severe' ? 'Severely raised' : 'Raised'} blood pressure — ${last!.bpSystolic}/${last!.bpDiastolic}`,
      });
    }

    for (const test of ['profileSyphilis', 'profileHepB', 'profileHiv', 'profileTb'] as const) {
      if (p[test] === 'positive') {
        const label = ANC_PROFILE.find((t) => PROFILE_COLUMN[t.test] === test)?.label ?? test;
        flags.push({ kind: 'profile', severity: 'warning', message: `${label} positive` });
      }
    }

    if (p.status === 'active') {
      const g = gestationOn(p, today());
      if (g?.postTerm) {
        flags.push({ kind: 'post-term', severity: 'warning', message: `Past the expected date — ${g.weeks} weeks` });
      }
    }

    const signs = contacts.flatMap((c) => c.dangerSigns ?? []);
    if (signs.length) {
      flags.push({ kind: 'danger-signs', severity: 'danger', message: `Danger signs recorded at an antenatal contact` });
    }

    const depressed = pnc.find((v) => v.depressionQ1 === true || v.depressionQ2 === true);
    if (depressed) {
      flags.push({
        kind: 'depression-screen',
        severity: 'warning',
        message: 'Postnatal depression screen positive — refer for full assessment',
      });
    }
    if (pnc.some((v) => v.ipvScreen === 'positive')) {
      flags.push({ kind: 'ipv', severity: 'danger', message: 'Intimate partner violence disclosed' });
    }

    return flags;
  }

  // ── Antenatal contacts ────────────────────────────────────────────────────

  async recordAncContact(facilityId: string, dto: AncContactDto, user?: CurrentUserType): Promise<AncContact> {
    const pregnancy = await this.require(facilityId, dto.pregnancyId);
    if (pregnancy.status === 'ended') {
      throw new BadRequestException('This pregnancy has ended — an antenatal contact cannot be added to it');
    }
    if (dto.contactDate > today()) {
      throw new BadRequestException('A contact cannot be recorded in the future');
    }

    const existing = await this.ancContacts.findOne({
      where: { facilityId, pregnancyId: dto.pregnancyId, contactNumber: dto.contactNumber },
    });
    if (existing) {
      throw new BadRequestException(`Contact ${dto.contactNumber} is already recorded for this pregnancy`);
    }

    const g = gestationOn(pregnancy, dto.contactDate);
    const row = await this.ancContacts.save(
      this.ancContacts.create({
        facilityId,
        pregnancyId: pregnancy.id,
        patientId: pregnancy.patientId,
        visitId: dto.visitId ?? null,
        contactNumber: dto.contactNumber,
        contactDate: dto.contactDate,
        gestationDays: g?.totalDays ?? null,
        weight: dto.weight != null ? String(dto.weight) : null,
        bpSystolic: dto.bpSystolic ?? null,
        bpDiastolic: dto.bpDiastolic ?? null,
        pulse: dto.pulse ?? null,
        temperature: dto.temperature != null ? String(dto.temperature) : null,
        muac: dto.muac != null ? String(dto.muac) : null,
        hb: dto.hb != null ? String(dto.hb) : null,
        urineProtein: (dto.urineProtein ?? null) as AncContact['urineProtein'],
        urineSugar: (dto.urineSugar ?? null) as AncContact['urineSugar'],
        fundalHeight: dto.fundalHeight ?? null,
        fetalHeartRate: dto.fetalHeartRate ?? null,
        presentation: (dto.presentation ?? null) as AncContact['presentation'],
        fetalMovement: dto.fetalMovement ?? null,
        ifasGiven: dto.ifasGiven ?? false,
        iptpDose: dto.iptpDose ?? null,
        dewormingGiven: dto.dewormingGiven ?? false,
        llinGiven: dto.llinGiven ?? false,
        tdDose: dto.tdDose ?? null,
        aspirinGiven: dto.aspirinGiven ?? false,
        calciumGiven: dto.calciumGiven ?? false,
        dangerSigns: dto.dangerSigns ?? [],
        referred: dto.referred ?? false,
        referredTo: dto.referredTo?.trim() || null,
        findings: dto.findings?.trim() || null,
        nextContactDate: dto.nextContactDate ?? null,
        recordedById: user?.id ?? null,
        recordedByName: this.fullName(user),
      }),
    );

    // Td given in pregnancy belongs in the immunisation record too — it is the
    // same dose, and keeping one copy is what makes the card trustworthy.
    if (dto.tdDose) await this.recordTd(facilityId, pregnancy.patientId, dto.tdDose, dto.contactDate, user);

    return row;
  }

  private async recordTd(
    facilityId: string,
    patientId: string,
    dose: number,
    givenDate: string,
    user?: CurrentUserType,
  ): Promise<void> {
    const already = await this.immunisations.findOne({
      where: { facilityId, patientId, vaccine: 'TD', dose },
    });
    if (already) return;
    await this.immunisations.save(
      this.immunisations.create({
        facilityId,
        patientId,
        vaccine: 'TD',
        dose,
        givenDate,
        givenHere: true,
        note: 'Given at an antenatal contact',
        givenById: user?.id ?? null,
        givenByName: this.fullName(user),
      }),
    );
  }

  async updateAncContact(facilityId: string, id: string, dto: Partial<AncContactDto>): Promise<AncContact> {
    const row = await this.ancContacts.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Contact not found');
    const { pregnancyId, contactNumber, weight, temperature, muac, hb, ...rest } = dto;
    Object.assign(row, rest);
    if (weight !== undefined) row.weight = String(weight);
    if (temperature !== undefined) row.temperature = String(temperature);
    if (muac !== undefined) row.muac = String(muac);
    if (hb !== undefined) row.hb = String(hb);
    return this.ancContacts.save(row);
  }

  async removeAncContact(facilityId: string, id: string): Promise<void> {
    const row = await this.ancContacts.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Contact not found');
    await this.ancContacts.remove(row);
  }

  // ── Postnatal contacts ────────────────────────────────────────────────────

  async recordPncContact(facilityId: string, dto: PncContactDto, user?: CurrentUserType): Promise<PncContact> {
    const pregnancy = await this.require(facilityId, dto.pregnancyId);
    if (!pregnancy.outcomeDate || !pregnancy.outcome) {
      throw new BadRequestException('Record the outcome of the pregnancy before its postnatal care');
    }
    if (!OUTCOMES_WITH_PNC.includes(pregnancy.outcome)) {
      throw new BadRequestException('Postnatal care follows a birth; this pregnancy ended another way');
    }
    if (dto.contactDate > today()) {
      throw new BadRequestException('A contact cannot be recorded in the future');
    }
    if (dto.contactDate < pregnancy.outcomeDate) {
      throw new BadRequestException('A postnatal contact cannot be before the birth');
    }

    // A woman who comes on day four falls between the guideline's windows. The
    // contact still happened, so it is filed against the window it is nearest
    // rather than refused — but only where the clinician did not name one.
    const window = (dto.window as PncWindow) ?? pncWindowFor(pregnancy.outcomeDate, dto.contactDate) ?? this.nearestWindow(pregnancy.outcomeDate, dto.contactDate);

    const existing = await this.pncContacts.findOne({
      where: { facilityId, pregnancyId: pregnancy.id, window },
    });
    if (existing) {
      throw new BadRequestException(`The ${PNC_WINDOW_LABEL[window]} contact is already recorded for this pregnancy`);
    }

    const days = Math.round(
      (new Date(`${dto.contactDate}T00:00:00Z`).getTime() -
        new Date(`${pregnancy.outcomeDate}T00:00:00Z`).getTime()) /
        86_400_000,
    );

    return this.pncContacts.save(
      this.pncContacts.create({
        facilityId,
        pregnancyId: pregnancy.id,
        patientId: pregnancy.patientId,
        babyPatientId: dto.babyPatientId ?? null,
        visitId: dto.visitId ?? null,
        window,
        contactDate: dto.contactDate,
        daysPostpartum: days,
        bpSystolic: dto.bpSystolic ?? null,
        bpDiastolic: dto.bpDiastolic ?? null,
        pulse: dto.pulse ?? null,
        temperature: dto.temperature != null ? String(dto.temperature) : null,
        hb: dto.hb != null ? String(dto.hb) : null,
        uterineInvolution: dto.uterineInvolution?.trim() || null,
        lochiaAmount: (dto.lochiaAmount ?? null) as PncContact['lochiaAmount'],
        lochiaOffensive: dto.lochiaOffensive ?? null,
        breastFindings: dto.breastFindings?.trim() || null,
        perineumFindings: dto.perineumFindings?.trim() || null,
        maternalDangerSigns: dto.maternalDangerSigns ?? [],
        depressionQ1: dto.depressionQ1 ?? null,
        depressionQ2: dto.depressionQ2 ?? null,
        ipvScreen: (dto.ipvScreen ?? 'not-asked') as PncContact['ipvScreen'],
        fpCounselled: dto.fpCounselled ?? false,
        fpMethod: dto.fpMethod?.trim() || null,
        cervicalScreeningOffered: dto.cervicalScreeningOffered ?? false,
        vitaminAGiven: dto.vitaminAGiven ?? false,
        babyWeight: dto.babyWeight != null ? String(dto.babyWeight) : null,
        babyTemperature: dto.babyTemperature != null ? String(dto.babyTemperature) : null,
        cordCondition: dto.cordCondition?.trim() || null,
        feedingMethod: (dto.feedingMethod ?? null) as PncContact['feedingMethod'],
        babyDangerSigns: dto.babyDangerSigns ?? [],
        immunisationUpToDate: dto.immunisationUpToDate ?? null,
        birthNotified: dto.birthNotified ?? false,
        referred: dto.referred ?? false,
        referredTo: dto.referredTo?.trim() || null,
        findings: dto.findings?.trim() || null,
        nextContactDate: dto.nextContactDate ?? null,
        recordedById: user?.id ?? null,
        recordedByName: this.fullName(user),
      }),
    );
  }

  /** The window whose midpoint the contact date is closest to. */
  private nearestWindow(birthDate: string, on: string): PncWindow {
    const days = Math.round(
      (new Date(`${on}T00:00:00Z`).getTime() - new Date(`${birthDate}T00:00:00Z`).getTime()) / 86_400_000,
    );
    const rows = [...PNC_CONTACTS];
    rows.sort(
      (a, b) =>
        Math.abs(days - (a.fromDays + a.toDays) / 2) - Math.abs(days - (b.fromDays + b.toDays) / 2),
    );
    return rows[0].window;
  }

  async updatePncContact(facilityId: string, id: string, dto: Partial<PncContactDto>): Promise<PncContact> {
    const row = await this.pncContacts.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Contact not found');
    const { pregnancyId, window, temperature, hb, babyWeight, babyTemperature, ...rest } = dto;
    Object.assign(row, rest);
    if (temperature !== undefined) row.temperature = String(temperature);
    if (hb !== undefined) row.hb = String(hb);
    if (babyWeight !== undefined) row.babyWeight = String(babyWeight);
    if (babyTemperature !== undefined) row.babyTemperature = String(babyTemperature);
    return this.pncContacts.save(row);
  }

  async removePncContact(facilityId: string, id: string): Promise<void> {
    const row = await this.pncContacts.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Contact not found');
    await this.pncContacts.remove(row);
  }

  // ── The clinic's worklist ─────────────────────────────────────────────────

  /** Open pregnancies with a contact due or overdue, soonest first. */
  async worklist(facilityId: string): Promise<
    {
      pregnancy: Pregnancy;
      patientName: string;
      gestationWeeks: number | null;
      next: AncContactStatus | null;
      overdue: number;
    }[]
  > {
    const open = await this.pregnancies.find({ where: { facilityId, status: 'active' } });
    if (!open.length) return [];

    const ids = open.map((p) => p.id);
    const contacts = await this.ancContacts.find({ where: { facilityId, pregnancyId: In(ids) } });
    const patients = await this.patients.find({ where: { id: In(open.map((p) => p.patientId)) } });
    const nameOf = new Map(patients.map((p) => [p.id, `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()]));

    const rows = open.map((p) => {
      const mine = contacts.filter((c) => c.pregnancyId === p.id);
      const statuses = ancContactStatuses(
        p,
        mine.map((c) => ({ contactNumber: c.contactNumber, contactDate: c.contactDate })),
      );
      const g = gestationOn(p, today());
      return {
        pregnancy: p,
        patientName: nameOf.get(p.patientId) ?? '',
        gestationWeeks: g?.weeks ?? null,
        next: statuses.find((s) => s.state === 'overdue' || s.state === 'due') ?? null,
        overdue: statuses.filter((s) => s.state === 'overdue').length,
      };
    });

    return rows
      .filter((r) => r.next)
      .sort((a, b) => (a.next!.dueDate < b.next!.dueDate ? -1 : 1));
  }
}
