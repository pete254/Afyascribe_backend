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
}
