import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';

/** Global toggle: when 'true' (or unset), staff sign-in requires the daily OTP. */
export const LOGIN_OTP_ENABLED = 'login_otp_enabled';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  /** Read a boolean setting, falling back when it has never been set. */
  async getBool(key: string, fallback: boolean): Promise<boolean> {
    const v = await this.get(key);
    if (v === null) return fallback;
    return v === 'true';
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.save({ key, value });
  }

  async setBool(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? 'true' : 'false');
  }
}
