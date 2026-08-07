// src/facilities/facilities.controller.ts
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
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilityResponseDto } from './dto/facility-response.dto';
import { ClinicMode } from './entities/facility.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';

@ApiTags('facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  // ── CREATE ────────────────────────────────────────────────────────────────
  @Post()
  @Roles('super_admin')
  @ApiOperation({ summary: 'Register a new facility (super_admin only)' })
  @ApiResponse({ status: 201, type: FacilityResponseDto })
  @ApiResponse({ status: 409, description: 'Facility code already exists' })
  async create(@Body() dto: CreateFacilityDto) {
    const facility = await this.facilitiesService.create(dto);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── LIST ALL ──────────────────────────────────────────────────────────────
  @Get()
  @Roles('super_admin')
  @ApiOperation({ summary: 'List all facilities (super_admin only)' })
  @ApiResponse({ status: 200, type: [FacilityResponseDto] })
  async findAll() {
    const facilities = await this.facilitiesService.findAll();
    return plainToInstance(FacilityResponseDto, facilities, {
      excludeExtraneousValues: true,
    });
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────
  // No @Roles here: a clinic owner is often an owner-doctor, whose `role` is
  // 'doctor', so a role-only gate locks them out of their own facility. The
  // check below mirrors FacilityLogoController.assertCanManageFacility, which
  // has always honoured isOwner.
  @Get(':id')
  @ApiOperation({ summary: 'Get a single facility by UUID' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  @ApiResponse({ status: 404, description: 'Facility not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserType) {
    this.assertCanViewFacility(id, user);
    const facility = await this.facilitiesService.findOne(id);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── GET STATS ─────────────────────────────────────────────────────────────
  @Get(':id/stats')
  @ApiOperation({ summary: 'Get user and patient counts for a facility' })
  async getStats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserType) {
    this.assertCanViewFacility(id, user);
    const result = await this.facilitiesService.getStats(id);
    return {
      ...result,
      facility: plainToInstance(FacilityResponseDto, result.facility, {
        excludeExtraneousValues: true,
      }),
    };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Update a facility (super_admin only)' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFacilityDto,
  ) {
    const facility = await this.facilitiesService.update(id, dto);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── DEACTIVATE ────────────────────────────────────────────────────────────
  @Patch(':id/deactivate')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Deactivate a facility (super_admin only)' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    const facility = await this.facilitiesService.deactivate(id);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── CLINIC MODE ───────────────────────────────────────────────────────────
  // How the practice is staffed, which decides how much of the workflow the
  // apps collapse into one screen. Owner or facility_admin, own facility only.
  @Patch(':id/clinic-mode')
  @ApiOperation({ summary: 'Set how the practice is staffed (solo / team / multi)' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  async setClinicMode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { clinicMode: ClinicMode },
    @CurrentUser() user: CurrentUserType,
  ) {
    this.assertCanViewFacility(id, user);
    if (!body?.clinicMode || !Object.values(ClinicMode).includes(body.clinicMode)) {
      throw new BadRequestException(
        `clinicMode must be one of: ${Object.values(ClinicMode).join(', ')}`,
      );
    }
    const facility = await this.facilitiesService.update(id, {
      clinicMode: body.clinicMode,
    } as any);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // Delegate LPO approval to the accountant (or take it back). Owner/admin only.
  @Patch(':id/lpo-approval')
  @ApiOperation({ summary: 'Allow the accountant to approve LPOs without owner sign-off' })
  async setLpoApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { accountantCanApproveLpo: boolean },
    @CurrentUser() user: CurrentUserType,
  ) {
    this.assertCanViewFacility(id, user);
    const facility = await this.facilitiesService.update(id, {
      accountantCanApproveLpo: !!body?.accountantCanApproveLpo,
    } as any);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // Opt this facility out of the daily login OTP (or back in). Owner/admin only.
  @Patch(':id/login-otp')
  @ApiOperation({ summary: 'Turn the daily sign-in OTP on or off for this facility' })
  async setLoginOtp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { loginOtpDisabled: boolean },
    @CurrentUser() user: CurrentUserType,
  ) {
    this.assertCanViewFacility(id, user);
    const facility = await this.facilitiesService.update(id, {
      loginOtpDisabled: !!body?.loginOtpDisabled,
    } as any);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // Set the default markup % that pre-fills new stock items. Owner/admin only.
  @Patch(':id/default-markup')
  @ApiOperation({ summary: 'Set the facility default markup % for new stock items' })
  async setDefaultMarkup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { defaultMarkupPct: number },
    @CurrentUser() user: CurrentUserType,
  ) {
    this.assertCanViewFacility(id, user);
    const pct = Math.max(0, Number(body?.defaultMarkupPct) || 0);
    const facility = await this.facilitiesService.update(id, {
      defaultMarkupPct: String(pct),
    } as any);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // Allow (or stop) doctors seeing patients who still owe a bill. Owner/admin only.
  @Patch(':id/pending-bill-policy')
  @ApiOperation({ summary: 'Allow the doctor to see patients with an unpaid bill' })
  async setPendingBillPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { allowDoctorWithPendingBill: boolean },
    @CurrentUser() user: CurrentUserType,
  ) {
    this.assertCanViewFacility(id, user);
    const facility = await this.facilitiesService.update(id, {
      allowDoctorWithPendingBill: !!body?.allowDoctorWithPendingBill,
    } as any);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Owners and facility admins may read their OWN facility; super_admin may read
   * any. Previously this was `@Roles('super_admin','facility_admin')`, which both
   * locked out owner-doctors and let a facility_admin read any facility by UUID.
   */
  private assertCanViewFacility(id: string, user: CurrentUserType) {
    if (user.role === 'super_admin') return;

    const isOwner = (user as any).isOwner === true;
    if (user.role !== 'facility_admin' && !isOwner) {
      throw new ForbiddenException('Only clinic owners and admins can view facility settings');
    }
    if (user.facilityId !== id) {
      throw new ForbiddenException('You can only view your own facility');
    }
  }
}