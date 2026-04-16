// src/auth/auth.service.ts
// UPDATED: Added registerWithInviteCode() for staff onboarding flow
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
import { FacilityType } from '../facilities/entities/facility.entity';
import { UseInviteCodeDto } from '../facilities/dto/use-invite-code.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly CODE_EXPIRY_MINUTES = 10;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private inviteCodesService: InviteCodesService,
    private facilitiesService: FacilitiesService,
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

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmailWithFacility(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isDeactivated) throw new UnauthorizedException('Account has been deactivated');

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId: user.facilityId ?? null,
      facilityCode: user.facility?.code ?? null,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        facilityId: user.facilityId ?? null,
        facilityCode: user.facility?.code ?? null,
        facilityName: user.facility?.name ?? null,
      },
    };
  }

  // ── REGISTER WITH INVITE CODE (staff onboarding) ───────────────────────────

  /**
   * Staff sign-up flow:
   * 1. Validate the invite code → get facilityId
   * 2. Create user linked to that facility
   * 3. Record invite code usage
   * 4. Return JWT immediately (no need to log in separately)
   */
  async registerWithInviteCode(dto: UseInviteCodeDto) {
    // 1. Validate the invite code
    const { facilityId, facilityName, facilityCode } =
      await this.inviteCodesService.validateCode(dto.inviteCode);

    // 2. Check email not already taken
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    // 3. Create the user
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      facilityId,
    });

    // 4. Record usage
    await this.inviteCodesService.recordUsage(dto.inviteCode);

    // 5. Send welcome email
    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
      );
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    // 6. Return JWT immediately so user is logged in right after sign-up
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId,
      facilityCode,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        facilityId,
        facilityCode,
        facilityName,
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
    try {
      await this.emailService.sendWelcomeEmail(user.email, `${user.firstName} ${user.lastName}`);
    } catch (e) {
      console.error('Welcome email failed:', e);
    }
    return result;
  }

  // ── VALIDATE INVITE CODE (check before filling form) ──────────────────────

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

    try {
      await this.emailService.sendResetCodeEmail(
        user.email,
        resetCode,
        `${user.firstName} ${user.lastName}`,
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

  /**
   * Clinic creation flow (owner signup):
   * 1. Check email not taken
   * 2. Create the facility (clinic)
   * 3. Create owner-doctor account linked to facility
   * 4. Generate invite code for the new clinic
   * 5. Return JWT immediately (owner is logged in)
   */
  async createClinic(dto: CreateClinicDto) {
    // 1. Check email not taken
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    // 2. Create facility
    const facility = await this.facilitiesService.create({
      name: dto.facilityName,
      code: dto.facilityCode.toUpperCase(),
      type: FacilityType.CLINIC,
    });

    // 3. Create owner-doctor account
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.DOCTOR,
      facilityId: facility.id,
    });

    // 4. Generate invite code for the new clinic
    const inviteCode = await this.inviteCodesService.generateCode(facility.id, user.id);

    // 5. Send welcome email
    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`,
      );
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    // 6. Return JWT immediately so owner is logged in right after setup
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      facilityId: facility.id,
      facilityCode: facility.code,
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
      },
      inviteCode: inviteCode.code,
    };
  }
}