// src/admin/admin.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  ForbiddenException,
  BadRequestException,
  UseGuards,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { AdminService } from './admin.service';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  // ── BOOTSTRAP (no auth, one-time use) ─────────────────────────────────────

  @Post('bootstrap')
  @ApiOperation({
    summary: 'Bootstrap first super_admin account (one-time only)',
    description:
      'Creates the very first super_admin. Protected by BOOTSTRAP_SECRET header. ' +
      'Fails if any super_admin already exists OR if secret is wrong/missing. ' +
      'Disable by removing BOOTSTRAP_SECRET from env after first use.',
  })
  @ApiHeader({
    name: 'x-bootstrap-secret',
    description: 'Must match BOOTSTRAP_SECRET env variable',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'super_admin created and JWT returned' })
  @ApiResponse({ status: 403, description: 'Invalid secret or super_admin already exists' })
  async bootstrap(
    @Headers('x-bootstrap-secret') secret: string,
    @Body() dto: BootstrapSuperAdminDto,
  ) {
    // 1. Check bootstrap secret exists in env
    const bootstrapSecret = this.configService.get<string>('BOOTSTRAP_SECRET');
    if (!bootstrapSecret) {
      throw new ForbiddenException('Bootstrap is disabled (BOOTSTRAP_SECRET not set)');
    }

    // 2. Check secret matches
    if (secret !== bootstrapSecret) {
      throw new ForbiddenException('Invalid bootstrap secret');
    }

    // 3. Check no super_admin exists yet
    const existingSuperAdmin = await this.adminService.superAdminExists();
    if (existingSuperAdmin) {
      throw new ForbiddenException(
        'A super_admin already exists. Bootstrap can only run once.',
      );
    }

    // 4. Create super_admin
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.adminService.createSuperAdmin({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
  }

  // ── CREATE ANY USER (super_admin only) ────────────────────────────────────

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create any user account (super_admin only)',
    description:
      'super_admin can create facility_admin, doctor, nurse, receptionist, or another super_admin. ' +
      'facilityId is required for all roles except super_admin.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'facilityId required for non-super_admin roles' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async createUser(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    // Validate facilityId requirement
    if (dto.role !== 'super_admin' && !dto.facilityId) {
      throw new BadRequestException(
        `facilityId is required when creating a user with role "${dto.role}"`,
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.adminService.createUser({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      facilityId: dto.facilityId ?? null,
    });
  }

  // ── LIST ALL USERS (super_admin only) ─────────────────────────────────────

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all users across all facilities (super_admin only)' })
  @ApiQuery({ name: 'facilityId', required: false, description: 'Filter by facility UUID' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role' })
  async listUsers(
    @Query('facilityId') facilityId?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers({ facilityId, role });
  }

  // ── GET SINGLE USER (super_admin only) ────────────────────────────────────

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a user by UUID (super_admin only)' })
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }
}