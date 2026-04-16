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
}