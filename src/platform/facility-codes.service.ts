import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreationCodeStatus,
  FacilityCreationCode,
} from './entities/facility-creation-code.entity';
import { CreateFacilityCodeDto } from './dto/platform.dto';

// No look-alike characters (0/O, 1/I) — these get read off a screen and typed
// by hand at the other end.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class FacilityCodesService {
  constructor(
    @InjectRepository(FacilityCreationCode)
    private readonly repo: Repository<FacilityCreationCode>,
  ) {}

  private randomCode(len = 10): string {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return out;
  }

  async create(dto: CreateFacilityCodeDto, createdBy: string): Promise<FacilityCreationCode> {
    // Retry on the vanishingly rare collision.
    let code = this.randomCode();
    for (let i = 0; i < 5 && (await this.repo.findOne({ where: { code } })); i++) {
      code = this.randomCode();
    }

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const row = this.repo.create({
      code,
      label: dto.label ?? null,
      notes: dto.notes ?? null,
      expiresAt,
      createdBy,
      status: CreationCodeStatus.UNUSED,
    });
    return this.repo.save(row);
  }

  async list(status?: CreationCodeStatus): Promise<FacilityCreationCode[]> {
    return this.repo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string): Promise<FacilityCreationCode> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Code not found');
    if (row.status === CreationCodeStatus.USED) {
      throw new BadRequestException('That code has already been redeemed and cannot be revoked.');
    }
    row.status = CreationCodeStatus.REVOKED;
    return this.repo.save(row);
  }

  /**
   * Check a code is redeemable and hand the row back, WITHOUT consuming it yet.
   * The caller creates the facility, then calls markUsed with the new id, so a
   * failed facility creation never burns the code.
   */
  async validateRedeemable(rawCode: string): Promise<FacilityCreationCode> {
    const code = (rawCode || '').toUpperCase().trim();
    if (!code) throw new BadRequestException('A facility creation code is required.');

    const row = await this.repo.findOne({ where: { code } });
    if (!row) throw new BadRequestException('That creation code is not valid.');
    if (row.status === CreationCodeStatus.USED) {
      throw new BadRequestException('That creation code has already been used.');
    }
    if (row.status === CreationCodeStatus.REVOKED) {
      throw new BadRequestException('That creation code has been revoked. Contact AfyaScribe.');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('That creation code has expired. Contact AfyaScribe.');
    }
    return row;
  }

  async markUsed(id: string, facilityId: string): Promise<void> {
    await this.repo.update(id, {
      status: CreationCodeStatus.USED,
      facilityId,
      usedAt: new Date(),
    });
  }
}
