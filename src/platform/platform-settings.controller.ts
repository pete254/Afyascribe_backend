import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LOGIN_OTP_ENABLED, PlatformSettingsService } from './platform-settings.service';

/**
 * Platform-wide settings the super_admin controls. The login-OTP kill switch
 * lives here so it can be turned off instantly during an email outage —
 * super_admin sign-in is itself exempt from OTP, so this stays reachable.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Read platform-wide settings' })
  async get() {
    return { loginOtpEnabled: await this.settings.getBool(LOGIN_OTP_ENABLED, true) };
  }

  @Patch()
  @ApiOperation({ summary: 'Update platform-wide settings' })
  async update(@Body() body: { loginOtpEnabled?: boolean }) {
    if (typeof body?.loginOtpEnabled === 'boolean') {
      await this.settings.setBool(LOGIN_OTP_ENABLED, body.loginOtpEnabled);
    }
    return { loginOtpEnabled: await this.settings.getBool(LOGIN_OTP_ENABLED, true) };
  }
}
