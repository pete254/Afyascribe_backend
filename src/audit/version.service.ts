import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordVersion } from './entities/record-version.entity';

@Injectable()
export class RecordVersionService {
  constructor(
    @InjectRepository(RecordVersion) private readonly versions: Repository<RecordVersion>,
  ) {}

  /** Every version of one record, oldest first — the record's history. */
  async forRecord(entityName: string, entityId: string): Promise<RecordVersion[]> {
    return this.versions.find({
      where: { entityName, entityId },
      order: { version: 'ASC' },
    });
  }

  /** Everything that has changed about one patient, newest first. */
  async forPatient(
    facilityId: string,
    patientId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ rows: RecordVersion[]; total: number }> {
    const [rows, total] = await this.versions
      .createQueryBuilder('v')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.patient_id = :patientId', { patientId })
      .orderBy('v.created_at', 'DESC')
      .take(Math.min(Math.max(opts.limit ?? 100, 1), 500))
      .skip(Math.max(opts.offset ?? 0, 0))
      .getManyAndCount();
    return { rows, total };
  }

  /** Recent changes across the facility. */
  async recent(
    facilityId: string,
    opts: { entityName?: string; from?: Date; to?: Date; limit?: number } = {},
  ): Promise<RecordVersion[]> {
    const qb = this.versions
      .createQueryBuilder('v')
      .where('v.facility_id = :facilityId', { facilityId })
      .orderBy('v.created_at', 'DESC')
      .take(Math.min(Math.max(opts.limit ?? 100, 1), 500));
    if (opts.entityName) qb.andWhere('v.entity_name = :entityName', { entityName: opts.entityName });
    if (opts.from) qb.andWhere('v.created_at >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('v.created_at <= :to', { to: opts.to });
    return qb.getMany();
  }

  /**
   * Amendments only — changes made after the fact, with a reason given.
   *
   * These are the ones a reviewer asks about: not the ordinary course of
   * filling a record in, but somebody going back to alter what it said.
   */
  async amendments(facilityId: string, limit = 100): Promise<RecordVersion[]> {
    return this.versions
      .createQueryBuilder('v')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.operation = :op', { op: 'updated' })
      .andWhere('v.version > 1')
      .andWhere('v.reason IS NOT NULL')
      .orderBy('v.created_at', 'DESC')
      .take(Math.min(Math.max(limit, 1), 500))
      .getMany();
  }
}
