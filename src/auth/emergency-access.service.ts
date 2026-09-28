import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmergencyAccess } from './entities/emergency-access.entity';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

/** How long a break-glass grant lasts before it lapses on its own. */
export const EMERGENCY_ACCESS_HOURS = 4;

/** A reason short enough to be meaningless is not a reason. */
const MIN_REASON = 15;

@Injectable()
export class EmergencyAccessService {
  constructor(
    @InjectRepository(EmergencyAccess) private readonly grants: Repository<EmergencyAccess>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  /** Whether this patient's record is withheld from ordinary clinical access. */
  async isRestricted(facilityId: string, patientId: string): Promise<boolean> {
    const patient = await this.patients.findOne({
      where: { id: patientId, facilityId },
      select: ['id', 'restricted'],
    });
    return !!patient?.restricted;
  }

  /** A grant this user currently holds for this patient, if any. */
  async activeGrant(
    facilityId: string,
    patientId: string,
    userId: string,
  ): Promise<EmergencyAccess | null> {
    const grant = await this.grants
      .createQueryBuilder('g')
      .where('g.facility_id = :facilityId', { facilityId })
      .andWhere('g.patient_id = :patientId', { patientId })
      .andWhere('g.user_id = :userId', { userId })
      .andWhere('g.revoked_at IS NULL')
      .andWhere('g.expires_at > now()')
      .orderBy('g.expires_at', 'DESC')
      .getOne();
    return grant ?? null;
  }

  /**
   * Open a restricted record.
   *
   * Nobody is refused. The point is not to stop a clinician reaching a patient
   * in front of them — that would cost more than it saved — but to make the
   * reaching deliberate, attributable and reviewed.
   */
  async grant(
    facilityId: string,
    patientId: string,
    reason: string,
    user: CurrentUserType,
  ): Promise<EmergencyAccess> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!reason || reason.trim().length < MIN_REASON) {
      throw new BadRequestException(
        `Say why this record is being opened, in at least ${MIN_REASON} characters. The reason is the whole of this control.`,
      );
    }

    return this.grants.save(
      this.grants.create({
        facilityId,
        patientId,
        userId: user.id,
        userName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || null,
        userRole: Array.isArray(user.roles) && user.roles.length ? user.roles[0] : ((user as { role?: string }).role ?? null),
        reason: reason.trim(),
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + EMERGENCY_ACCESS_HOURS * 3_600_000),
      }),
    );
  }

  /** Refuse, with an explanation the caller can act on. */
  refuse(patientId: string): never {
    throw new ForbiddenException({
      message:
        "This patient's record is restricted. Open it with a reason if you need it for their care — the access will be recorded and reviewed.",
      code: 'emergency-access-required',
      patientId,
    });
  }

  async close(facilityId: string, id: string): Promise<EmergencyAccess> {
    const grant = await this.grants.findOne({ where: { id, facilityId } });
    if (!grant) throw new NotFoundException('Not found');
    grant.revokedAt = new Date();
    return this.grants.save(grant);
  }

  /** Grants for an administrator to look over, unreviewed first. */
  async list(facilityId: string, onlyUnreviewed = false): Promise<EmergencyAccess[]> {
    const qb = this.grants
      .createQueryBuilder('g')
      .where('g.facility_id = :facilityId', { facilityId })
      .orderBy('g.reviewed', 'ASC')
      .addOrderBy('g.granted_at', 'DESC')
      .take(200);
    if (onlyUnreviewed) qb.andWhere('g.reviewed = false');
    return qb.getMany();
  }

  async review(
    facilityId: string,
    id: string,
    note: string,
    user: CurrentUserType,
  ): Promise<EmergencyAccess> {
    const grant = await this.grants.findOne({ where: { id, facilityId } });
    if (!grant) throw new NotFoundException('Not found');
    grant.reviewed = true;
    grant.reviewNote = note?.trim() || null;
    grant.reviewedByName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || null;
    return this.grants.save(grant);
  }

  /** Mark a record as restricted, or release it. */
  async setRestricted(
    facilityId: string,
    patientId: string,
    restricted: boolean,
    reason?: string,
  ): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');
    patient.restricted = restricted;
    patient.restrictedReason = restricted ? (reason?.trim() || null) : null;
    return this.patients.save(patient);
  }
}
