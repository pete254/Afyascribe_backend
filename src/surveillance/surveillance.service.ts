import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DiseaseNotification } from './entities/disease-notification.entity';
import { SoapNote } from '../soap-notes/entities/soap-note.entity';
import { PatientProblem } from '../problems/entities/patient-problem.entity';
import { OPEN_STATUSES } from '../problems/problem.enums';
import { Detection, detectNotifiable, highestUrgency } from './detect';
import { CONDITION_BY_CODE, IDSR_CONDITIONS, IDSR_SOURCE, IHR_SOURCE } from './data/idsr';
import { CurrentUserType } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { Patient } from '../patients/entities/patient.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { NotifyDto } from './dto/surveillance.dto';

/** The Ministry asks for immediate conditions within 24 hours of suspicion. */
export const IMMEDIATE_WINDOW_HOURS = 24;

const today = () => new Date().toISOString().slice(0, 10);

export interface SuggestionView {
  conditionCode: string;
  conditionName: string;
  immediate: boolean;
  ihr?: string;
  suspectedCase: string;
  /** The words that triggered it. */
  context: string;
  /** An existing record for this patient and condition, if there is one. */
  existing: DiseaseNotification | null;
}

@Injectable()
export class SurveillanceService {
  constructor(
    @InjectRepository(DiseaseNotification)
    private readonly notifications: Repository<DiseaseNotification>,
    @InjectRepository(SoapNote) private readonly notes: Repository<SoapNote>,
    @InjectRepository(PatientProblem) private readonly problems: Repository<PatientProblem>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Facility) private readonly facilities: Repository<Facility>,
    private readonly config: ConfigService,
  ) {}

  private name(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || null;
  }

  /** The Ministry's lists, with their source, for the forms and the screens. */
  reference() {
    return {
      source: IDSR_SOURCE,
      ihr: IHR_SOURCE,
      conditions: IDSR_CONDITIONS,
      counts: {
        immediate: IDSR_CONDITIONS.filter((c) => c.immediate).length,
        weekly: IDSR_CONDITIONS.filter((c) => c.weekly).length,
      },
    };
  }

  /**
   * What a patient's record suggests right now.
   *
   * Reads the visit's diagnoses and the problem list. Returns suggestions —
   * nothing is written, because looking at a record should not create a
   * notification in it.
   */
  async suggestionsFor(
    facilityId: string,
    patientId: string,
    opts: { visitId?: string; text?: string } = {},
  ): Promise<{ urgency: 'immediate' | 'weekly' | null; suggestions: SuggestionView[] }> {
    const sources: string[] = [];
    if (opts.text?.trim()) sources.push(opts.text);

    // The visit's own notes, or the patient's most recent, so a suggestion can
    // be raised from a consultation still being written.
    const notes = await this.notes.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    for (const n of notes) {
      sources.push(
        [
          n.diagnosis,
          n.symptoms,
          n.icd11Description,
          ...(n.icd11Codes ?? []).map((c) => c.description),
        ]
          .filter((v): v is string => typeof v === 'string')
          .join(' . '),
      );
    }

    const problems = await this.problems.find({ where: { facilityId, patientId } });
    for (const p of problems) {
      // Only problems still open: a resolved condition is history, not a case.
      if (!OPEN_STATUSES.includes(p.status)) continue;
      sources.push(`${p.display ?? ''} ${p.code ?? ''}`);
    }

    const found = new Map<string, Detection>();
    for (const text of sources) {
      for (const d of detectNotifiable(text)) {
        if (!found.has(d.condition.code)) found.set(d.condition.code, d);
      }
    }
    if (!found.size) return { urgency: null, suggestions: [] };

    // An existing record means this has already been looked at; the screen
    // should say so rather than ask again.
    const existing = await this.notifications.find({
      where: { facilityId, patientId, conditionCode: In([...found.keys()]) },
    });

    const suggestions: SuggestionView[] = [...found.values()].map((d) => ({
      conditionCode: d.condition.code,
      conditionName: d.condition.name,
      immediate: d.condition.immediate,
      ihr: d.condition.ihr,
      suspectedCase: d.condition.suspectedCase,
      context: d.context,
      existing:
        existing.find(
          (e) => e.conditionCode === d.condition.code && (!opts.visitId || e.visitId === opts.visitId || !e.visitId),
        ) ?? null,
    }));

    return { urgency: highestUrgency([...found.values()]), suggestions };
  }

  /** Open a record for a condition — the step before anyone is told. */
  async record(
    facilityId: string,
    input: {
      patientId: string;
      conditionCode: string;
      visitId?: string;
      sourceText?: string;
      detectedFrom?: DiseaseNotification['detectedFrom'];
      onsetDate?: string;
    },
  ): Promise<DiseaseNotification> {
    const condition = CONDITION_BY_CODE.get(input.conditionCode);
    if (!condition) throw new BadRequestException('Not an IDSR priority condition');

    const existing = input.visitId
      ? await this.notifications.findOne({
          where: {
            facilityId,
            patientId: input.patientId,
            visitId: input.visitId,
            conditionCode: condition.code,
          },
        })
      : null;
    if (existing) return existing;

    return this.notifications.save(
      this.notifications.create({
        facilityId,
        patientId: input.patientId,
        visitId: input.visitId ?? null,
        conditionCode: condition.code,
        conditionName: condition.name,
        immediate: condition.immediate,
        detectedFrom: input.detectedFrom ?? 'diagnosis',
        sourceText: input.sourceText?.slice(0, 2000) ?? null,
        status: 'suggested',
        onsetDate: input.onsetDate ?? today(),
        detectedAt: new Date(),
      }),
    );
  }

  /** Say nobody needs telling, and why. Kept, never deleted. */
  async dismiss(
    facilityId: string,
    id: string,
    reason: string,
    user?: CurrentUserType,
  ): Promise<DiseaseNotification> {
    const row = await this.notifications.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Not found');
    if (!reason?.trim()) {
      throw new BadRequestException(
        'A dismissal needs a reason. An outbreak review asks who decided not to notify, and why.',
      );
    }
    row.status = 'dismissed';
    row.dismissedReason = reason.trim();
    row.dismissedByName = this.name(user);
    return this.notifications.save(row);
  }

  async list(
    facilityId: string,
    opts: { status?: string; conditionCode?: string; from?: string; to?: string } = {},
  ): Promise<DiseaseNotification[]> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n.facility_id = :facilityId', { facilityId })
      .orderBy('n.immediate', 'DESC')
      .addOrderBy('n.created_at', 'DESC');
    if (opts.status) qb.andWhere('n.status = :status', { status: opts.status });
    if (opts.conditionCode) qb.andWhere('n.condition_code = :code', { code: opts.conditionCode });
    if (opts.from) qb.andWhere('n.onset_date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('n.onset_date <= :to', { to: opts.to });
    return qb.getMany();
  }

  // ── Notifying ─────────────────────────────────────────────────────────────

  /**
   * Complete MOH 502 and tell the sub-county.
   *
   * The alert is attempted as part of notifying, not left to a background job:
   * a clinician who has just filled the form should be told there and then
   * whether it got out, because if it did not, the Ministry still expects a
   * phone call within the day.
   */
  async notify(
    facilityId: string,
    id: string,
    dto: NotifyDto,
    user?: CurrentUserType,
  ): Promise<{ notification: DiseaseNotification; alert: { attempted: boolean; ok: boolean; detail: string } }> {
    const row = await this.notifications.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Not found');
    if (row.status === 'dismissed') {
      throw new BadRequestException('This was dismissed. Record a fresh one rather than reviving it.');
    }

    Object.assign(row, {
      status: 'notified',
      caseClassification: dto.caseClassification ?? row.caseClassification,
      onsetDate: dto.onsetDate ?? row.onsetDate,
      firstSeenDate: dto.firstSeenDate ?? row.firstSeenDate,
      meansOfDiagnosis: dto.meansOfDiagnosis ?? row.meansOfDiagnosis,
      patientStatus: dto.patientStatus ?? row.patientStatus,
      specimenCollected: dto.specimenCollected ?? row.specimenCollected,
      specimenType: dto.specimenType?.trim() || row.specimenType,
      specimenSentDate: dto.specimenSentDate ?? row.specimenSentDate,
      labName: dto.labName?.trim() || row.labName,
      labResultReceived: dto.labResultReceived ?? row.labResultReceived,
      epidNo: dto.epidNo?.trim() || row.epidNo,
      reportedByName: dto.reportedByName?.trim() || this.name(user),
      reportedByDesignation: dto.reportedByDesignation?.trim() || row.reportedByDesignation,
      form: { ...(row.form ?? {}), ...(dto.form ?? {}) },
      notes: dto.notes?.trim() || row.notes,
      notifiedAt: new Date(),
      notifiedByName: this.name(user),
      notifiedSubCountyAt: new Date(),
    });

    const alert = await this.sendAlert(facilityId, row);
    row.alertedAt = alert.attempted ? new Date() : null;
    row.alertChannel = alert.attempted ? 'webhook' : null;
    row.alertStatus = alert.attempted ? (alert.ok ? 'sent' : 'failed') : 'not-configured';

    return { notification: await this.notifications.save(row), alert };
  }

  /**
   * Push the case to wherever the county has asked for it.
   *
   * There is no national endpoint to default to — DHA\'s HIE publishes no
   * surveillance API, and IDSR reporting in Kenya runs through KHIS and the
   * sub-county surveillance coordinator. Inventing a URL would produce a
   * feature that silently fails, so an unconfigured system says so plainly and
   * the form is still there to be exported or phoned through.
   */
  private async sendAlert(
    facilityId: string,
    row: DiseaseNotification,
  ): Promise<{ attempted: boolean; ok: boolean; detail: string }> {
    const url = this.config.get<string>('IDSR_ALERT_URL');
    if (!url) {
      return {
        attempted: false,
        ok: false,
        detail:
          'No surveillance endpoint is configured, so nothing was transmitted. The case is recorded — notify the sub-county surveillance coordinator by phone, and set IDSR_ALERT_URL to transmit automatically.',
      };
    }

    try {
      const payload = await this.moh502(facilityId, row);
      const token = this.config.get<string>('IDSR_ALERT_TOKEN');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      return {
        attempted: true,
        ok: res.ok,
        detail: res.ok ? `Sent to ${url}` : `${url} responded ${res.status}`,
      };
    } catch (err) {
      return { attempted: true, ok: false, detail: (err as Error).message };
    }
  }

  /** The case as MOH 502, section by section, for transmission or export. */
  async moh502(facilityId: string, row: DiseaseNotification): Promise<Record<string, unknown>> {
    const [patient, facility] = await Promise.all([
      this.patients.findOne({ where: { id: row.patientId, facilityId } }),
      this.facilities.findOne({ where: { id: facilityId } }),
    ]);
    const condition = CONDITION_BY_CODE.get(row.conditionCode);

    return {
      form: 'MOH 502 — Integrated Case Based Surveillance Form',
      epidNo: row.epidNo,
      A_reportingSite: {
        healthFacility: facility?.name ?? null,
        kmhflCode: (facility as unknown as { kmhflCode?: string })?.kmhflCode ?? null,
        subCounty: (facility as unknown as { subCounty?: string })?.subCounty ?? null,
        county: (facility as unknown as { county?: string })?.county ?? null,
        diseaseReported: condition?.name ?? row.conditionName,
        conditionCode: row.conditionCode,
      },
      B_identification: {
        name: patient ? `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim() : null,
        sex: patient?.gender ?? null,
        dateOfBirth: patient?.dateOfBirth ?? null,
        patientNumber: patient?.patientId ?? null,
        residence: {
          village: patient?.village ?? null,
          ward: patient?.ward ?? null,
          subCounty: patient?.subCounty ?? null,
          county: patient?.county ?? null,
          address: patient?.physicalAddress ?? null,
        },
        telephone: patient?.phoneNumber ?? null,
        tracer: (row.form as Record<string, unknown>)?.tracer ?? null,
      },
      C_clinical: {
        onsetDate: row.onsetDate,
        firstSeenDate: row.firstSeenDate,
        notifiedSubCountyAt: row.notifiedSubCountyAt,
        diagnosis: row.conditionName,
        meansOfDiagnosis: row.meansOfDiagnosis,
        caseClassification: row.caseClassification,
        patientStatus: row.patientStatus,
        vaccination: (row.form as Record<string, unknown>)?.vaccination ?? null,
      },
      diseaseSpecific: (row.form as Record<string, unknown>)?.diseaseSpecific ?? null,
      G_laboratory: {
        specimenCollected: row.specimenCollected,
        specimenType: row.specimenType,
        specimenSentDate: row.specimenSentDate,
        labName: row.labName,
        resultReceived: row.labResultReceived,
      },
      H_reporter: {
        completedBy: row.reportedByName,
        designation: row.reportedByDesignation,
        notifiedAt: row.notifiedAt,
      },
      notes: row.notes,
      source: IDSR_SOURCE,
    };
  }

  /** One case as MOH 502, for a printout or an email. */
  async exportCase(facilityId: string, id: string): Promise<Record<string, unknown>> {
    const row = await this.notifications.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Not found');
    return this.moh502(facilityId, row);
  }

  /**
   * Immediate cases still waiting to be notified, most overdue first.
   *
   * The Ministry\'s window is 24 hours from suspicion, so the clock runs from
   * when the condition was detected rather than from when anyone got round to
   * opening the form.
   */
  async outstanding(facilityId: string): Promise<
    {
      notification: DiseaseNotification;
      hoursWaiting: number;
      overdue: boolean;
    }[]
  > {
    const rows = await this.notifications.find({
      where: { facilityId, status: 'suggested' },
      order: { immediate: 'DESC', createdAt: 'ASC' },
    });
    const now = Date.now();
    return rows
      .map((notification) => {
        const from = (notification.detectedAt ?? notification.createdAt).getTime();
        const hoursWaiting = Math.round(((now - from) / 3_600_000) * 10) / 10;
        return {
          notification,
          hoursWaiting,
          overdue: notification.immediate && hoursWaiting > IMMEDIATE_WINDOW_HOURS,
        };
      })
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.hoursWaiting - a.hoursWaiting);
  }
}