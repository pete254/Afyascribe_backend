// src/auth/auth.service.ts
// UPDATED: isOwner + clinicMode now included in JWT payload and user response
// so permissions survive logout/login cycles.
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../common/services/email.service';
import { InviteCodesService } from '../facilities/invite-codes.service';
import { FacilitiesService } from '../facilities/facilities.service';
import { UserRole } from '../users/entities/user.entity';
import { FacilityStatus, FacilityType } from '../facilities/entities/facility.entity';
import { UseInviteCodeDto } from '../facilities/dto/use-invite-code.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { FacilityCodesService } from '../platform/facility-codes.service';
import {
  LOGIN_OTP_ENABLED,
  PlatformSettingsService,
} from '../platform/platform-settings.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly CODE_EXPIRY_MINUTES = 10;
  private readonly LOGIN_CODE_MAX_ATTEMPTS = 5;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private inviteCodesService: InviteCodesService,
    private facilitiesService: FacilitiesService,
    private facilityCodesService: FacilityCodesService,
    private platformSettings: PlatformSettingsService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  /**
   * Validate credentials and account/facility state, returning the full user
   * (with facility) ready to be turned into a token. Throws on any failure.
   */
  private async assertLoginable(email: string, password: string) {
    const user = await this.usersService.findByEmailWithFacility(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isDeactivated) throw new UnauthorizedException('Account has been deactivated');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    // AfyaScribe can pause or deactivate a facility (e.g. for non-payment).
    // When that happens, its staff cannot sign in. super_admin is exempt — they
    // are platform-level, not tied to a facility's subscription.
    const facilityStatus = (user.facility as any)?.status;
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      facilityStatus &&
      facilityStatus !== FacilityStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        facilityStatus === FacilityStatus.SUSPENDED
          ? 'Your facility’s access is currently paused. Please contact AfyaScribe to restore it.'
          : 'Your facility’s access has been deactivated. Please contact AfyaScribe.',
      );
    }

    return user;
  }

  /** Turn a validated user into the signed JWT + user response. */
  private buildAuthResponse(user: any) {
    // isOwner: true if the user was the one who created the clinic
    const isOwner = (user as any).isOwner === true;
    const clinicMode = (user.facility as any)?.clinicMode ?? null;
    const facilityLogoUrl = user.facility?.logoUrl ?? null;

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId: user.facilityId ?? null,
      facilityCode: user.facility?.code ?? null,
      // Persist these so capabilities work after re-login
      isOwner,
      clinicMode,
      facilityLogoUrl,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role],
        facilityId: user.facilityId ?? null,
        facilityCode: user.facility?.code ?? null,
        facilityName: user.facility?.name ?? null,
        isOwner,
        clinicMode,
        facilityLogoUrl,
      },
    };
  }

  // ── DAILY SIGN-IN CODE (2FA) ────────────────────────────────────────────────

  /**
   * Whether this user must complete the daily OTP step. super_admin is exempt —
   * so the global kill switch stays reachable during an email outage — and the
   * step is skipped when disabled platform-wide or opted out by the facility.
   */
  private async isOtpRequired(user: any): Promise<boolean> {
    if (user.role === UserRole.SUPER_ADMIN) return false;
    const globalOn = await this.platformSettings.getBool(LOGIN_OTP_ENABLED, true);
    if (!globalOn) return false;
    if ((user.facility as any)?.loginOtpDisabled === true) return false;
    return true;
  }

  /** Last instant of today in East Africa Time (UTC+3, no DST) — the code's expiry. */
  private endOfDayEAT(): Date {
    const EAT_MIN = 3 * 60;
    const eatNow = new Date(Date.now() + EAT_MIN * 60000);
    const y = eatNow.getUTCFullYear();
    const m = eatNow.getUTCMonth();
    const d = eatNow.getUTCDate();
    return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - EAT_MIN * 60000);
  }

  /**
   * Ensure the user has a valid code for today. Reuses an unexpired one so the
   * same code serves every sign-in that day; only generates (and flags a send)
   * when there isn't one. Returns the code and whether it was newly created.
   */
  private async issueLoginCode(user: any): Promise<{ code: string; isNew: boolean }> {
    if (
      user.loginCode &&
      user.loginCodeExpiresAt &&
      new Date(user.loginCodeExpiresAt) > new Date()
    ) {
      return { code: user.loginCode, isNew: false };
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.usersService.setLoginCode(user.id, code, this.endOfDayEAT());
    user.loginCode = code; // keep the in-memory copy consistent for this request
    return { code, isNew: true };
  }

  private async sendLoginCode(user: any, code: string): Promise<void> {
    console.log(`🔑 [DEV] Login code for ${user.email}: ${code}`);
    try {
      await this.emailService.sendLoginCodeEmail(
        user.email,
        code,
        `${user.firstName} ${user.lastName}`,
        user.facility?.logoUrl ?? null,
      );
    } catch (e) {
      console.error('Login code email failed:', e);
      throw new BadRequestException('Could not send your sign-in code. Please try again.');
    }
  }

  async login(email: string, password: string) {
    const user = await this.assertLoginable(email, password);

    if (await this.isOtpRequired(user)) {
      const { code, isNew } = await this.issueLoginCode(user);
      // Only email on the first sign-in of the day; later ones point the user to
      // the code already in their inbox (with a resend button in the app).
      if (isNew) await this.sendLoginCode(user, code);
      return {
        otpRequired: true,
        email: user.email,
        message: isNew
          ? "We've emailed you a 6-digit sign-in code. It's valid until midnight."
          : 'Enter the sign-in code we emailed you earlier today, or tap resend.',
      };
    }

    return this.buildAuthResponse(user);
  }

  /** Resend today's code (or make one if none) after a correct password. */
  async resendLoginCode(email: string, password: string): Promise<{ message: string }> {
    const user = await this.assertLoginable(email, password);
    if (!(await this.isOtpRequired(user))) {
      return { message: 'No sign-in code is required for this account.' };
    }
    const { code } = await this.issueLoginCode(user);
    await this.sendLoginCode(user, code);
    return { message: 'Code re-sent. Please check your email.' };
  }

  /** Complete a sign-in with the daily code (password re-checked as the 1st factor). */
  async loginWithCode(email: string, password: string, code: string) {
    const user = await this.assertLoginable(email, password);

    // If OTP isn't in play for this account, the password alone is enough.
    if (!(await this.isOtpRequired(user))) return this.buildAuthResponse(user);

    if (!user.loginCode || !user.loginCodeExpiresAt) {
      throw new UnauthorizedException('No active sign-in code. Please request a new one.');
    }
    if (new Date() > new Date(user.loginCodeExpiresAt)) {
      throw new UnauthorizedException('Your sign-in code has expired. Please request a new one.');
    }
    if (user.loginCodeAttempts >= this.LOGIN_CODE_MAX_ATTEMPTS) {
      await this.usersService.clearLoginCode(user.id);
      throw new UnauthorizedException('Too many attempts. Please request a new code.');
    }
    if (user.loginCode !== code) {
      const attempts = await this.usersService.incrementLoginCodeAttempts(user.id);
      throw new UnauthorizedException(
        `Invalid code. ${this.LOGIN_CODE_MAX_ATTEMPTS - attempts} attempt(s) remaining.`,
      );
    }

    // Correct — keep the code (valid all day) but clear the failed-attempt count.
    if (user.loginCodeAttempts > 0) {
      await this.usersService.setLoginCode(
        user.id,
        user.loginCode,
        new Date(user.loginCodeExpiresAt),
      );
    }
    return this.buildAuthResponse(user);
  }

  // ── REGISTER WITH INVITE CODE (staff onboarding) ───────────────────────────

  async registerWithInviteCode(dto: UseInviteCodeDto) {
    const { facilityId, facilityName, facilityCode } =
      await this.inviteCodesService.validateCode(dto.inviteCode);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      facilityId,
    });

    await this.inviteCodesService.recordUsage(dto.inviteCode);

    // Fetch the facility to get clinicMode
    const facility = await this.facilitiesService.findOne(facilityId);
    const clinicMode = (facility as any).clinicMode ?? null;
    const facilityLogoUrl = (facility as any).logoUrl ?? null;

    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
        facilityLogoUrl,
      );
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId,
      facilityCode,
      isOwner: false,
      clinicMode,
      facilityLogoUrl,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role],
        facilityId,
        facilityCode,
        facilityName,
        isOwner: false,
        clinicMode,
        facilityLogoUrl,
      },
    };
  }

  // ── REGISTER DIRECT (facility_admin / super_admin creating accounts) ────────

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: UserRole = UserRole.DOCTOR,
    facilityId?: string,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      facilityId: facilityId ?? null,
    });

    const { password: _, ...result } = user;
    let facilityLogoUrl: string | null = null;
    if (facilityId) {
      try {
        facilityLogoUrl = ((await this.facilitiesService.findOne(facilityId)) as any)?.logoUrl ?? null;
      } catch {
        /* logo is best-effort */
      }
    }
    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
        facilityLogoUrl,
      );
    } catch (e) {
      console.error('Welcome email failed:', e);
    }
    return result;
  }

  // ── VALIDATE INVITE CODE ───────────────────────────────────────────────────

  async validateInviteCode(code: string) {
    return this.inviteCodesService.validateCode(code);
  }

  // ── PASSWORD RESET ─────────────────────────────────────────────────────────

  async requestResetCode(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return { message: 'If the email exists, a reset code has been sent' };

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MINUTES * 60 * 1000);

    console.log(`🔑 [DEV] Reset code for ${email}: ${resetCode}`);
    await this.usersService.setResetCode(user.id, resetCode, expiresAt);

    let facilityLogoUrl: string | null = null;
    if (user.facilityId) {
      try {
        facilityLogoUrl =
          ((await this.facilitiesService.findOne(user.facilityId)) as any)?.logoUrl ?? null;
      } catch {
        /* logo is best-effort */
      }
    }

    try {
      await this.emailService.sendResetCodeEmail(
        user.email,
        resetCode,
        `${user.firstName} ${user.lastName}`,
        facilityLogoUrl,
      );
    } catch (e) {
      console.error('Reset email failed:', e);
      throw new BadRequestException('Failed to send reset code email');
    }

    return { message: 'If the email exists, a reset code has been sent' };
  }

  async verifyResetCode(email: string, code: string): Promise<{ valid: boolean; message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user?.resetCode || !user.resetCodeExpiresAt) return { valid: false, message: 'Invalid or expired code' };
    if (new Date() > user.resetCodeExpiresAt) return { valid: false, message: 'Reset code has expired' };
    if (user.resetCodeAttempts >= this.MAX_ATTEMPTS) {
      await this.usersService.clearResetCode(user.id);
      return { valid: false, message: 'Maximum attempts exceeded. Please request a new code' };
    }
    if (user.resetCode !== code) {
      const attempts = await this.usersService.incrementResetCodeAttempts(user.id);
      return { valid: false, message: `Invalid code. ${this.MAX_ATTEMPTS - attempts} attempt(s) remaining` };
    }
    return { valid: true, message: 'Code verified successfully' };
  }

  async resetPasswordWithCode(email: string, code: string, newPassword: string) {
    const verification = await this.verifyResetCode(email, code);
    if (!verification.valid) throw new BadRequestException(verification.message);
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    await this.usersService.updatePassword(user.id, await bcrypt.hash(newPassword, 10));
    await this.usersService.clearResetCode(user.id);
    return { message: 'Password reset successfully' };
  }

  // ── CREATE CLINIC (facility owner setup) ────────────────────────────────────

  async createClinic(dto: CreateClinicDto) {
    // A facility can only be created with a valid, unused code issued by
    // AfyaScribe. Validate before touching anything else, and don't consume it
    // until the facility actually exists, so a failure here never burns a code.
    const codeRow = await this.facilityCodesService.validateRedeemable(dto.creationCode);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    // Create facility with clinicMode
    const facility = await this.facilitiesService.create({
      name: dto.facilityName,
      code: dto.facilityCode.toUpperCase(),
      type: FacilityType.CLINIC,
    });

    // Redeem the code now that the facility is real.
    await this.facilityCodesService.markUsed(codeRow.id, facility.id);

    // Store clinicMode on facility (update after creation)
    try {
      await this.facilitiesService.update(facility.id, { clinicMode: dto.clinicMode } as any);
    } catch (e) {
      console.log('clinicMode field may not exist yet:', e.message);
    }

    // Create owner-doctor with isOwner flag
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.DOCTOR,
      facilityId: facility.id,
      isOwner: true,
    } as any);

    // Generate invite code
    const inviteCode = await this.inviteCodesService.generateCode(facility.id, user.id);

    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
        facility.logoUrl ?? null,
      );
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId: facility.id,
      facilityCode: facility.code,
      isOwner: true,
      clinicMode: dto.clinicMode,
      facilityLogoUrl: facility.logoUrl ?? null,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        facilityId: facility.id,
        facilityCode: facility.code,
        facilityName: facility.name,
        isOwner: true,
        clinicMode: dto.clinicMode,
        facilityLogoUrl: facility.logoUrl ?? null,
      },
      inviteCode: inviteCode.code,
    };
  }
}