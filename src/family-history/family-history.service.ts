import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FamilyHistory } from './entities/family-history.entity';
import { CreateFamilyHistoryDto, UpdateFamilyHistoryDto } from './dto/family-history.dto';
import { FamilyHistoryStatus, relationshipOf } from './family-history.enums';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

@Injectable()
export class FamilyHistoryService {
  constructor(
    @InjectRepository(FamilyHistory) private readonly history: Repository<FamilyHistory>,
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

  /** Closest relatives first — a mother's history weighs more than a cousin's. */
  async list(facilityId: string, patientId: string): Promise<FamilyHistory[]> {
    await this.assertPatient(facilityId, patientId);
    const rows = await this.history.find({
      where: { facilityId, patientId },
      order: { createdAt: 'ASC' },
    });
    return rows
      .filter((r) => r.status !== 'entered-in-error')
      .sort((a, b) => (relationshipOf(a.relationship)?.degree ?? 9) - (relationshipOf(b.relationship)?.degree ?? 9));
  }

  private clean(conditions: CreateFamilyHistoryDto['conditions']): FamilyHistory['conditions'] {
    return (conditions ?? [])
      .filter((c) => c.display?.trim())
      .map((c) => ({
        code: c.code?.trim() || null,
        display: c.display.trim(),
        onsetAge: c.onsetAge ?? null,
        contributedToDeath: c.contributedToDeath ?? false,
        note: c.note?.trim() || null,
      }));
  }

  async create(facilityId: string, dto: CreateFamilyHistoryDto, user?: CurrentUserType): Promise<FamilyHistory> {
    await this.assertPatient(facilityId, dto.patientId);
    return this.history.save(
      this.history.create({
        facilityId,
        patientId: dto.patientId,
        relationship: dto.relationship,
        name: dto.name?.trim() || null,
        gender: dto.gender ?? null,
        bornYear: dto.bornYear ?? null,
        deceased: dto.deceased ?? false,
        ageAtDeath: dto.ageAtDeath ?? null,
        conditions: this.clean(dto.conditions),
        // "Not known" is a real answer: a patient who cannot tell you their
        // father's history is not the same as a father who was healthy.
        status: (dto.status as FamilyHistoryStatus) ?? (dto.conditions?.length ? 'partial' : 'health-unknown'),
        note: dto.note?.trim() || null,
        recordedById: user?.id ?? null,
        recordedByName: this.fullName(user),
      }),
    );
  }

  async update(facilityId: string, id: string, dto: UpdateFamilyHistoryDto): Promise<FamilyHistory> {
    const row = await this.history.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Family history entry not found');

    if (dto.relationship) row.relationship = dto.relationship;
    if (dto.name !== undefined) row.name = dto.name?.trim() || null;
    if (dto.gender !== undefined) row.gender = dto.gender ?? null;
    if (dto.bornYear !== undefined) row.bornYear = dto.bornYear ?? null;
    if (dto.deceased !== undefined) row.deceased = dto.deceased;
    if (dto.ageAtDeath !== undefined) row.ageAtDeath = dto.ageAtDeath ?? null;
    if (dto.conditions !== undefined) row.conditions = this.clean(dto.conditions);
    if (dto.status) row.status = dto.status as FamilyHistoryStatus;
    if (dto.note !== undefined) row.note = dto.note?.trim() || null;
    return this.history.save(row);
  }
}
