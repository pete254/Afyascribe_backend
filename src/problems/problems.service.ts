import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientProblem } from './entities/patient-problem.entity';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';
import { OPEN_STATUSES, ProblemStatus } from './problem.enums';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ProblemsService {
  constructor(
    @InjectRepository(PatientProblem) private readonly problems: Repository<PatientProblem>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  private fullName(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  private async assertPatient(facilityId: string, patientId: string) {
    const p = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!p) throw new NotFoundException('Patient not found');
  }

  /**
   * The active problem list, or the whole history. Active means the condition
   * is still going — resolved and inactive problems stay on the record.
   */
  async list(facilityId: string, patientId: string, activeOnly = false): Promise<PatientProblem[]> {
    await this.assertPatient(facilityId, patientId);
    const rows = await this.problems.find({
      where: { facilityId, patientId },
      order: { createdAt: 'DESC' },
    });
    return activeOnly ? rows.filter((p) => OPEN_STATUSES.includes(p.status)) : rows;
  }

  async create(facilityId: string, dto: CreateProblemDto, user?: CurrentUserType): Promise<PatientProblem> {
    await this.assertPatient(facilityId, dto.patientId);
    const display = dto.display.trim();

    // The same condition should appear once while it is running, so the list
    // reads as a list of problems rather than a log of mentions.
    const open = (await this.list(facilityId, dto.patientId, true)).find(
      (p) =>
        (dto.code && p.code && p.code === dto.code) ||
        p.display.trim().toLowerCase() === display.toLowerCase(),
    );
    if (open) throw new BadRequestException(`${open.display} is already on this patient's problem list`);

    return this.problems.save(
      this.problems.create({
        facilityId,
        patientId: dto.patientId,
        code: dto.code?.trim() || null,
        system: 'ICD-11',
        display,
        status: (dto.status as ProblemStatus) ?? 'active',
        verificationStatus: (dto.verificationStatus as PatientProblem['verificationStatus']) ?? 'confirmed',
        category: (dto.category as PatientProblem['category']) ?? 'problem-list-item',
        severity: (dto.severity as PatientProblem['severity']) ?? null,
        onsetDate: dto.onsetDate ?? null,
        note: dto.note ?? null,
        sourceNoteId: dto.sourceNoteId ?? null,
        recordedById: user?.id ?? null,
        recordedByName: this.fullName(user),
        revisions: [],
      }),
    );
  }

  async update(facilityId: string, id: string, dto: UpdateProblemDto, user?: CurrentUserType): Promise<PatientProblem> {
    const problem = await this.problems.findOne({ where: { id, facilityId } });
    if (!problem) throw new NotFoundException('Problem not found');

    if (dto.status && dto.status !== problem.status) {
      problem.revisions = [
        ...(problem.revisions ?? []),
        {
          at: new Date().toISOString(),
          byId: user?.id ?? null,
          byName: this.fullName(user),
          from: problem.status,
          to: dto.status as ProblemStatus,
          reason: dto.statusReason?.trim() || null,
        },
      ];
      problem.status = dto.status as ProblemStatus;
      // Closing a problem dates it; reopening one clears the date.
      if (!OPEN_STATUSES.includes(problem.status)) {
        problem.abatementDate = dto.abatementDate ?? problem.abatementDate ?? today();
      } else {
        problem.abatementDate = null;
      }
    }
    if (dto.abatementDate !== undefined) problem.abatementDate = dto.abatementDate ?? null;
    if (dto.verificationStatus) problem.verificationStatus = dto.verificationStatus as PatientProblem['verificationStatus'];
    if (dto.severity !== undefined) problem.severity = dto.severity as PatientProblem['severity'];
    if (dto.category) problem.category = dto.category as PatientProblem['category'];
    if (dto.onsetDate !== undefined) problem.onsetDate = dto.onsetDate ?? null;
    if (dto.note !== undefined) problem.note = dto.note ?? null;
    if (dto.display) problem.display = dto.display.trim();
    return this.problems.save(problem);
  }

  /**
   * Fold the diagnoses written on a consultation into the problem list, so the
   * list fills from ordinary work instead of being kept up by hand. A code that
   * is already running is left alone — the visit is not a new problem.
   */
  async recordFromNote(
    facilityId: string,
    patientId: string,
    noteId: string,
    diagnoses: { code?: string | null; display: string }[],
    user?: CurrentUserType,
  ): Promise<number> {
    if (!diagnoses.length) return 0;
    const open = await this.list(facilityId, patientId, true);
    let added = 0;
    for (const d of diagnoses) {
      const display = (d.display ?? '').trim();
      if (!display) continue;
      const running = open.find(
        (p) =>
          (d.code && p.code && p.code === d.code) ||
          p.display.trim().toLowerCase() === display.toLowerCase(),
      );
      if (running) continue;
      const saved = await this.problems.save(
        this.problems.create({
          facilityId,
          patientId,
          code: d.code?.trim() || null,
          system: 'ICD-11',
          display,
          status: 'active',
          verificationStatus: 'confirmed',
          // Recorded at a visit; a clinician can promote it to a standing
          // problem once it proves to be one.
          category: 'encounter-diagnosis',
          onsetDate: today(),
          sourceNoteId: noteId,
          recordedById: user?.id ?? null,
          recordedByName: this.fullName(user),
          revisions: [],
        }),
      );
      open.push(saved);
      added += 1;
    }
    return added;
  }
}
