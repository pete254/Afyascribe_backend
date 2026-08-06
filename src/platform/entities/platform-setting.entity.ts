import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A tiny key/value store for platform-wide (super_admin) settings that need to
 * be flipped at runtime — e.g. the global login-OTP kill switch. Values are
 * stored as strings; helpers on PlatformSettingsService coerce them.
 */
@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'varchar' })
  value: string;
}
