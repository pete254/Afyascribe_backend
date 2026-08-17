// src/facilities/invite-codes.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacilityInviteCode } from './entities/facility-invite-code.entity';
import { FacilitiesService } from './facilities.service';

@Injectable()
export class InviteCodesService {
  // Invite codes are valid for 30 days
  private readonly EXPIRY_DAYS = 30;

  constructor(
    @InjectRepository(FacilityInviteCode)
    private readonly inviteCodeRepository: Repository<FacilityInviteCode>,
    private readonly facilitiesService: FacilitiesService,
  ) {}

  /**
   * Generate (or regenerate) an invite code for a facility.
   * Only one active code exists per facility at a time.
   * Regenerating deactivates the previous code immediately.
   */
  async generateCode(facilityId: string, generatedById: string): Promise<FacilityInviteCode> {
    // Verify facility exists
    await this.facilitiesService.findOne(facilityId);

    // Deactivate any existing active codes for this facility
    await this.inviteCodeRepository.update(
      { facilityId, isActive: true },
      { isActive: false },
    );

    const code = this.generateAlphanumericCode(8);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.EXPIRY_DAYS);

    const inviteCode = this.inviteCodeRepository.create({
      code,
      facilityId,
      generatedById,
      expiresAt,
      isActive: true,
      usageCount: 0,
    });

    return this.inviteCodeRepository.save(inviteCode);
  }

  /**
   * Get the current active invite code for a facility.
   * Returns null if none exists or all have expired.
   */
  async getActiveCode(facilityId: string): Promise<FacilityInviteCode | null> {
    const code = await this.inviteCodeRepository.findOne({
      where: { facilityId, isActive: true },
      relations: ['generatedBy'],
      order: { createdAt: 'DESC' },
    });

    if (!code) return null;

    // Auto-deactivate if expired
    if (new Date() > code.expiresAt) {
      await this.inviteCodeRepository.update(code.id, { isActive: false });
      return null;
    }

    return code;
  }

  /**
   * Validate an invite code entered by a new staff member.
   * Returns the facilityId the code belongs to.
   */
  async validateCode(code: string): Promise<{ facilityId: string; facilityName: string; facilityCode: string }> {
    const inviteCode = await this.inviteCodeRepository.findOne({
      where: { code: code.toUpperCase(), isActive: true },
      relations: ['facility'],
    });

    if (!inviteCode) {
      throw new BadRequestException('Invalid or expired invite code');
    }

    if (new Date() > inviteCode.expiresAt) {
      await this.inviteCodeRepository.update(inviteCode.id, { isActive: false });
      throw new BadRequestException('This invite code has expired. Ask your facility admin to regenerate it.');
    }

    return {
      facilityId: inviteCode.facilityId,
      facilityName: inviteCode.facility.name,
      facilityCode: inviteCode.facility.code,
    };
  }

  /**
   * Atomically consume a **single-use** invite code.
   *
   * The code is retired (`isActive = false`) the moment it is first used, so the
   * same code can never create a second account — a person given a code cannot
   * onboard themselves twice (or grant themselves several roles). The update is
   * conditional on the code still being unused (`usageCount = 0`), active and
   * unexpired, so two racing sign-ups with the same code can never both win:
   * exactly one row is affected and the other caller gets `false`.
   *
   * Returns true when this call consumed the code, false when it was already
   * used, deactivated or expired.
   */
  async consumeCode(code: string): Promise<boolean> {
    const res = await this.inviteCodeRepository
      .createQueryBuilder()
      .update()
      .set({ usageCount: () => '"usageCount" + 1', isActive: false })
      .where('code = :code', { code: code.toUpperCase() })
      .andWhere('"isActive" = true')
      .andWhere('"usageCount" = 0')
      .andWhere('"expiresAt" > now()')
      .execute();
    return (res.affected ?? 0) > 0;
  }

  /**
   * Get code history for a facility (for audit purposes).
   */
  async getCodeHistory(facilityId: string): Promise<FacilityInviteCode[]> {
    return this.inviteCodeRepository.find({
      where: { facilityId },
      relations: ['generatedBy'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  /**
   * Generate a random 8-character uppercase alphanumeric code.
   * Excludes confusing characters: O, 0, I, 1, L
   */
  private generateAlphanumericCode(length: number): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}