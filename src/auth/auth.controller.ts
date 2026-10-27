// src/auth/auth.controller.ts
// UPDATED: Added register-with-invite and validate-invite-code endpoints
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { LoginWithCodeDto } from './dto/login-with-code.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetCodeDto } from './dto/request-reset-code.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';
import { UseInviteCodeDto } from '../facilities/dto/use-invite-code.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { Throttle } from '@nestjs/throttler';
import { clientIp } from '../common/client-ip';
import { Public } from './decorators/public.decorator';
import { TotpService } from './totp.service';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

/** Where the request came from — see common/client-ip.ts for why not the header. */
const callerIp = clientIp;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private totp: TotpService,
  ) {}

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'On success returns a token, unless the daily OTP is required — then it ' +
      'emails a 6-digit code and returns { otpRequired: true }. Complete with /auth/login-with-code.',
  })
  @Throttle({ medium: { limit: 10, ttl: 300_000 } })
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    return this.authService.login(loginDto.email, loginDto.password, {
      ip: callerIp(req),
      path: '/auth/login',
    });
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Extend a session that is still alive',
    description:
      'Sessions lapse after a period of inactivity. A client that is being used refreshes; one nobody has touched does not, and the terminal closes itself.',
  })
  refresh(@CurrentUser() user: any) {
    return this.authService.refreshSession(user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Ends the session on the server: its tokens are refused from now on, rather than lingering until they expire. Logged.',
  })
  logout(@CurrentUser() user: any, @Req() req: any) {
    return this.authService.logout(user, {
      ip: callerIp(req),
      path: '/auth/logout',
    });
  }

  @Public()
  @Post('login-with-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish sign-in with the daily 6-digit code (2nd factor)',
  })
  @Throttle({ medium: { limit: 10, ttl: 300_000 } })
  async loginWithCode(@Body() dto: LoginWithCodeDto, @Req() req: any) {
    return this.authService.loginWithCode(dto.email, dto.password, dto.code, {
      ip: callerIp(req),
      path: '/auth/login-with-code',
    });
  }

  @Public()
  @Post('resend-login-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-send today’s sign-in code (requires correct password)',
  })
  @Throttle({ medium: { limit: 5, ttl: 300_000 } })
  async resendLoginCode(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.resendLoginCode(dto.email, dto.password, {
      ip: callerIp(req),
      path: '/auth/resend-login-code',
    });
  }

  // ── REGISTER WITH INVITE CODE (primary staff sign-up flow) ────────────────

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new staff account using a facility invite code',
    description:
      'Staff enter the 8-character invite code from their facility admin, ' +
      'plus their personal details. The code automatically links them to the correct facility.',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created and logged in',
    schema: {
      example: {
        access_token: 'eyJ...',
        user: {
          id: 'uuid',
          email: 'john.doe@knh.go.ke',
          firstName: 'John',
          lastName: 'Doe',
          role: 'doctor',
          facilityId: 'uuid',
          facilityCode: 'KNH',
          facilityName: 'Kenyatta National Hospital',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired invite code' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: UseInviteCodeDto) {
    return this.authService.registerWithInviteCode(dto);
  }

  // ── VALIDATE INVITE CODE (call before showing sign-up form) ───────────────

  @Public()
  @Get('validate-invite/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if an invite code is valid',
    description:
      'Call this when the user enters their code on the landing screen. ' +
      'Returns facility name so you can show "You are joining: Kenyatta National Hospital"',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        facilityId: 'uuid',
        facilityName: 'Kenyatta National Hospital',
        facilityCode: 'KNH',
      },
    },
  })
  async validateInviteCode(@Param('code') code: string) {
    return this.authService.validateInviteCode(code);
  }

  // ── PASSWORD RESET ─────────────────────────────────────────────────────────

  @Public()
  @Post('request-reset-code')
  @Throttle({ medium: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a 6-digit password reset code' })
  async requestResetCode(@Body() dto: RequestResetCodeDto, @Req() req: any) {
    return this.authService.requestResetCode(dto.email, {
      ip: callerIp(req),
      path: '/auth/request-reset-code',
    });
  }

  @Public()
  @Post('verify-reset-code')
  @Throttle({ medium: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a 6-digit reset code' })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto.email, dto.code);
  }

  @Public()
  @Post('reset-password-with-code')
  @Throttle({ medium: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using verified 6-digit code' })
  async resetPasswordWithCode(
    @Body() dto: ResetPasswordWithCodeDto,
    @Req() req: any,
  ) {
    return this.authService.resetPasswordWithCode(
      dto.email,
      dto.code,
      dto.newPassword,
      {
        ip: callerIp(req),
        path: '/auth/reset-password-with-code',
      },
    );
  }

  // ── CREATE CLINIC (facility owner setup) ────────────────────────────────────

  @Public()
  @Post('create-clinic')
  @ApiOperation({
    summary: 'Create a new clinic and owner account in one step',
  })
  async createClinic(@Body() dto: CreateClinicDto) {
    return this.authService.createClinic(dto);
  }

  // ── AUTHENTICATOR APP (TOTP) ───────────────────────────────────────────────
  // The second factor that does not depend on email. Set up and removed by the
  // signed-in user; reset by an administrator for a lost phone. Every change
  // is in the audit ledger.

  @Get('totp')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Whether your authenticator app is set up' })
  totpStatus(@CurrentUser() user: any) {
    return this.totp.status(user.id);
  }

  @Post('totp/setup')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start setting up an authenticator app',
    description:
      'Returns the secret as an otpauth:// link (for a QR code) and as text. Finish with /auth/totp/confirm.',
  })
  totpSetup(@CurrentUser() user: any) {
    return this.totp.begin(user.id);
  }

  @Post('totp/confirm')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 10, ttl: 300_000 } })
  @ApiOperation({
    summary:
      'Finish set-up with a code from the app; returns ten backup codes, shown once',
  })
  async totpConfirm(
    @CurrentUser() user: any,
    @Body() body: { code?: string },
    @Req() req: any,
  ) {
    const result = await this.totp.confirm(user.id, String(body?.code ?? ''));
    await this.authService.recordMfaChange(
      'mfa.enrolled',
      { ip: callerIp(req), path: '/auth/totp/confirm' },
      user,
    );
    return result;
  }

  @Post('totp/remove')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 10, ttl: 300_000 } })
  @ApiOperation({
    summary:
      'Remove your authenticator app, with a current code or a backup code',
  })
  async totpRemove(
    @CurrentUser() user: any,
    @Body() body: { code?: string },
    @Req() req: any,
  ) {
    await this.totp.remove(user.id, String(body?.code ?? ''));
    await this.authService.recordMfaChange(
      'mfa.removed',
      { ip: callerIp(req), path: '/auth/totp/remove' },
      user,
    );
    return { message: 'Authenticator app removed.' };
  }

  @Post('totp/reset/:userId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset a staff member's authenticator app (lost phone)",
    description:
      'Facility administrators, for their own staff. They can set it up again once signed in.',
  })
  async totpReset(
    @CurrentUser() admin: any,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: any,
  ) {
    const target = await this.totp.reset(admin, userId);
    await this.authService.recordMfaChange(
      'mfa.reset',
      { ip: callerIp(req), path: '/auth/totp/reset' },
      admin,
      `for ${target.email}`,
    );
    return { message: `Authenticator app reset for ${target.email}.` };
  }
}
