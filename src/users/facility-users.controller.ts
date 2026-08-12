// src/users/facility-users.controller.ts
// UPDATED: 
//  - Added GET /facility/users/doctors — accessible to ALL staff for assignment dropdowns
//  - GET /facility/users now accessible to all roles (but staff management ops still owner-only)
//  - Removed role restriction from GET / and GET doctors so receptionists, nurses can list staff
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { InviteCodesService } from '../facilities/invite-codes.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UserRole } from './entities/user.entity';

/**
 * Guard helper — user is allowed to manage staff if they are:
 * - facility_admin or super_admin (always)
 * - A doctor with isOwner === true on their token
 */
function assertCanManageStaff(user: any): void {
  const isAdmin = user.role === 'facility_admin' || user.role === 'super_admin';
  const isOwner = (user as any).isOwner === true;
  if (!isAdmin && !isOwner) {
    throw new ForbiddenException('Only clinic owners and admins can manage staff');
  }
}

@ApiTags('facility-users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facility/users')
export class FacilityUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly inviteCodesService: InviteCodesService,
  ) {}

  // ── LIST doctors only — accessible to ALL authenticated staff ──────────────
  // Used by queue/triage/SOAP screens to populate the doctor assignment dropdown.
  // Must be defined BEFORE the generic GET / to avoid route collision.

  @Get('doctors')
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'List all doctors in your facility (all staff can call this)' })
  async listDoctors(@CurrentUser() user: CurrentUserType) {
    const all = await this.usersService.findByFacility(user.facilityId);
    return (all as any[]).filter(u => u.role === 'doctor');
  }

  // ── LIST all users in my facility ──────────────────────────────────────────
  // All staff can see the list; management operations are guarded separately.

  @Get()
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'List all staff in your facility' })
  async listFacilityUsers(@CurrentUser() user: CurrentUserType) {
    assertCanManageStaff(user);
    return this.usersService.findByFacility(user.facilityId);
  }

  // ── CREATE staff directly (no invite code) ─────────────────────────────────

  @Post()
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Create a staff account in your facility' })
  @ApiResponse({ status: 201, description: 'Staff account created' })
  @ApiResponse({ status: 403, description: 'Not a clinic owner' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    assertCanManageStaff(user);
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      facilityId: user.facilityId,
    });
  }

  // ── GET invite code for my facility ───────────────────────────────────────

  @Get('invite-code')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: 'Get the current active invite code for your facility',
    description: 'Share this code with new staff. Valid for 30 days.',
  })
  async getInviteCode(@CurrentUser() user: CurrentUserType) {
    assertCanManageStaff(user);
    const code = await this.inviteCodesService.getActiveCode(user.facilityId);
    if (!code) {
      return {
        code: null,
        message: 'No active invite code. Use POST /facility/users/invite-code/generate to create one.',
      };
    }
    const daysLeft = Math.ceil(
      (new Date(code.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return {
      code: code.code,
      expiresAt: code.expiresAt,
      daysLeft,
      usageCount: code.usageCount,
      generatedAt: code.createdAt,
    };
  }

  // ── GENERATE / REGENERATE invite code ─────────────────────────────────────

  @Post('invite-code/generate')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: 'Generate (or regenerate) invite code for your facility',
    description:
      'Creates a new 30-day invite code. If one already exists it is immediately invalidated.',
  })
  async generateInviteCode(@CurrentUser() user: CurrentUserType) {
    assertCanManageStaff(user);
    const inviteCode = await this.inviteCodesService.generateCode(
      user.facilityId,
      user.id,
    );
    const daysLeft = Math.ceil(
      (new Date(inviteCode.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return {
      code: inviteCode.code,
      expiresAt: inviteCode.expiresAt,
      daysLeft,
      message: `Share this code with new staff. It expires in ${daysLeft} days.`,
    };
  }

  // ── GET invite code history ────────────────────────────────────────────────

  @Get('invite-code/history')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'View invite code generation history for audit' })
  async getInviteCodeHistory(@CurrentUser() user: CurrentUserType) {
    assertCanManageStaff(user);
    return this.inviteCodesService.getCodeHistory(user.facilityId);
  }

  // ── DEACTIVATE a staff member ──────────────────────────────────────────────

  @Patch(':userId/deactivate')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Deactivate a staff member in your facility' })
  async deactivateStaff(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: CurrentUserType,
  ) {
    assertCanManageStaff(admin);
    const targetUser = await this.usersService.findById(userId);
    if (targetUser.facilityId !== admin.facilityId && admin.role !== 'super_admin') {
      throw new ForbiddenException('You can only manage users in your own facility');
    }
    await this.usersService.deactivateAccount(userId, body.reason);
    return { message: 'User deactivated successfully' };
  }

  // ── REACTIVATE a staff member ──────────────────────────────────────────────

  @Patch(':userId/reactivate')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Reactivate a deactivated staff member' })
  async reactivateStaff(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: CurrentUserType,
  ) {
    assertCanManageStaff(admin);
    const targetUser = await this.usersService.findById(userId);
    if (targetUser.facilityId !== admin.facilityId && admin.role !== 'super_admin') {
      throw new ForbiddenException('You can only manage users in your own facility');
    }
    await this.usersService.reactivateAccount(userId);
    return { message: 'User reactivated successfully' };
  }

  // ── CHANGE a staff member's role ───────────────────────────────────────────

  @Patch(':userId/role')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "Change a staff member's role",
    description:
      'Role is what the app offers and what the API allows, so this both grants ' +
      'and revokes access. Owners cannot be demoted, and nobody can change their own role.',
  })
  async setStaffRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { role?: UserRole; roles?: UserRole[] },
    @CurrentUser() admin: CurrentUserType,
  ) {
    assertCanManageStaff(admin);

    // A person can hold several roles. Accept either `roles` (preferred) or a
    // single `role` for backward compatibility. Storekeeper is retired — its
    // stock duties are covered by the pharmacist.
    const allowed = [
      UserRole.FACILITY_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.LAB_TECHNICIAN,
      UserRole.PHARMACIST,
      UserRole.CASHIER,
      UserRole.ACCOUNTANT,
      UserRole.PROCUREMENT_OFFICER,
      UserRole.HR_MANAGER,
    ];
    const requested = [...new Set(body?.roles ?? (body?.role ? [body.role] : []))];
    if (requested.length === 0) {
      throw new BadRequestException('At least one role is required');
    }
    const invalid = requested.filter((r) => !allowed.includes(r));
    if (invalid.length) {
      throw new BadRequestException(
        `Invalid role(s): ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}`,
      );
    }

    const target = await this.usersService.findById(userId);
    if (target.facilityId !== admin.facilityId && admin.role !== 'super_admin') {
      throw new ForbiddenException('You can only manage users in your own facility');
    }
    // Guard against locking the facility out of its own administration.
    if (target.id === admin.id) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if ((target as any).isOwner === true) {
      throw new ForbiddenException("The clinic owner's role cannot be changed");
    }

    await this.usersService.setRoles(userId, requested);
    return { message: 'Roles updated successfully', roles: requested, role: requested[0] };
  }

  // ── SET a staff member's per-capability permission overrides ────────────────

  @Patch(':userId/permissions')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "Set a staff member's per-capability permission overrides",
    description:
      'A map of capability key → allow(true)/deny(false), applied on top of the ' +
      "user's roles. Owner-only. The owner's own permissions cannot be changed.",
  })
  async setStaffPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { overrides: Record<string, boolean> | null },
    @CurrentUser() admin: CurrentUserType,
  ) {
    assertCanManageStaff(admin);

    const target = await this.usersService.findById(userId);
    if (target.facilityId !== admin.facilityId && admin.role !== 'super_admin') {
      throw new ForbiddenException('You can only manage users in your own facility');
    }
    if ((target as any).isOwner === true) {
      throw new ForbiddenException("The clinic owner's permissions cannot be changed");
    }

    // Keep only real booleans.
    const raw = body?.overrides ?? {};
    const overrides: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'boolean') overrides[k] = v;
    }

    await this.usersService.setPermissionOverrides(userId, overrides);
    return { message: 'Permissions updated successfully', overrides };
  }
}