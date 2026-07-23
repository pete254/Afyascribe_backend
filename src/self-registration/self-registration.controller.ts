// src/self-registration/self-registration.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { SelfRegistrationService } from './self-registration.service';
import {
  ApproveSelfRegistrationDto,
  CreateSelfRegistrationDto,
} from './dto/self-registration.dto';
import { SelfRegStatus } from './entities/self-registration.entity';

/**
 * Two halves with very different exposure:
 *
 *  - The patient half (`POST /self-registration`, `GET /self-registration/facility/:code`)
 *    is UNAUTHENTICATED — reached by scanning a poster QR. It is write-only plus
 *    a name lookup: nothing here can read the register, a queue, or any other
 *    submission. Do not add a guarded read to this pair.
 *  - The staff half carries JwtAuthGuard + RolesGuard and is scoped to the
 *    caller's own facility, so one facility cannot review another's.
 */
@ApiTags('self-registration')
@Controller('self-registration')
export class SelfRegistrationController {
  constructor(private readonly svc: SelfRegistrationService) {}

  // ── Public (patient's phone) ──────────────────────────────────────────────

  /** Confirms to the patient which facility the QR belongs to. Name and logo only. */
  @Get('facility/:code')
  @ApiOperation({ summary: 'Public: resolve a facility code from the poster QR' })
  facility(@Param('code') code: string) {
    return this.svc.facilityByCode(code);
  }

  @Post()
  @ApiOperation({ summary: 'Public: a patient pre-registers from their phone' })
  create(@Body() dto: CreateSelfRegistrationDto) {
    return this.svc.create(dto);
  }

  // ── Staff (front desk) ────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('receptionist', 'nurse', 'doctor', 'facility_admin', 'super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List self-registrations for the caller’s facility' })
  list(@CurrentUser() user: CurrentUserType, @Query('status') status?: SelfRegStatus) {
    return this.svc.list(this.facilityOf(user), status);
  }

  @Get(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('receptionist', 'nurse', 'doctor', 'facility_admin', 'super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Look up the code a patient is holding' })
  getByCode(@Param('code') code: string, @CurrentUser() user: CurrentUserType) {
    return this.svc.getByCode(code, this.facilityOf(user));
  }

  @Post(':code/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('receptionist', 'nurse', 'doctor', 'facility_admin', 'super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Approve a submission into the patient register',
    description:
      'Send an empty body to approve exactly as submitted, or the corrected ' +
      'fields to fix what the patient typed before it enters the register.',
  })
  approve(
    @Param('code') code: string,
    @CurrentUser() user: CurrentUserType,
    @Body() edits?: ApproveSelfRegistrationDto,
  ) {
    if (!user.facilityCode) {
      throw new BadRequestException('Your account is not linked to a facility');
    }
    return this.svc.approve(code, this.facilityOf(user), user.facilityCode, user.id, edits);
  }

  @Post(':code/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('receptionist', 'nurse', 'doctor', 'facility_admin', 'super_admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reject a submission' })
  async reject(@Param('code') code: string, @CurrentUser() user: CurrentUserType) {
    await this.svc.reject(code, this.facilityOf(user), user.id);
    return { ok: true };
  }

  private facilityOf(user: CurrentUserType): string {
    if (!user.facilityId) {
      throw new BadRequestException('Your account is not linked to a facility');
    }
    return user.facilityId;
  }
}
