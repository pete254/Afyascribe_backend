// src/patient-visits/patient-visits.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PatientVisitsService } from './patient-visits.service';
import { CheckInDto } from './dto/check-in.dto';
import { TriageDto } from './dto/triage.dto';
import { ReassignDto } from './dto/reassign.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('patient-visits')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient-visits')
export class PatientVisitsController {
  constructor(private readonly visitsService: PatientVisitsService) {}

  // ── CHECK IN (receptionist, facility_admin) ────────────────────────────────
  @Post('check-in')
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Check in a patient and assign to a doctor' })
  async checkIn(@Body() dto: CheckInDto, @CurrentUser() user: any) {
    return this.visitsService.checkIn(dto, user.userId, user.facilityId);
  }

  // ── GET ACTIVE QUEUE (all staff in facility) ───────────────────────────────
  @Get('queue')
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: "Get today's active queue for the facility" })
  async getActiveQueue(@CurrentUser() user: any) {
    return this.visitsService.getActiveQueue(user.facilityId);
  }

  // ── GET DOCTOR'S OWN QUEUE ─────────────────────────────────────────────────
  @Get('my-queue')
  @Roles('doctor')
  @ApiOperation({ summary: "Get the current doctor's patient queue" })
  async getMyQueue(@CurrentUser() user: any) {
    return this.visitsService.getDoctorQueue(user.userId, user.facilityId);
  }

  // ── GET QUEUE STATS (for home screen cards) ────────────────────────────────
  @Get('stats')
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Get queue stats for home screen counters' })
  async getStats(@CurrentUser() user: any) {
    const doctorId = user.role === 'doctor' ? user.userId : undefined;
    return this.visitsService.getQueueStats(user.facilityId, doctorId);
  }

  // ── GET ALL VISITS (filterable) ────────────────────────────────────────────
  @Get()
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Get all visits for the facility (filterable by status/doctor)' })
  async findAll(@CurrentUser() user: any, @Query() query: QueryVisitsDto) {
    return this.visitsService.findAll(user.facilityId, query);
  }

  // ── GET SINGLE VISIT ───────────────────────────────────────────────────────
  @Get(':id')
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Get a single visit by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.findOne(id, user.facilityId);
  }

  // ── SUBMIT TRIAGE (nurse or doctor) ───────────────────────────────────────
  @Patch(':id/triage')
  @Roles('nurse', 'doctor', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Submit triage vitals for a visit' })
  async submitTriage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TriageDto,
    @CurrentUser() user: any,
  ) {
    return this.visitsService.submitTriage(id, dto, user.userId, user.facilityId);
  }

  // ── REASSIGN DOCTOR (receptionist / facility_admin only) ───────────────────
  @Patch(':id/reassign')
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Reassign visit to a different doctor' })
  async reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignDto,
    @CurrentUser() user: any,
  ) {
    return this.visitsService.reassign(id, dto, user.facilityId);
  }

  // ── MARK WITH DOCTOR (doctor opens patient record) ─────────────────────────
  @Patch(':id/with-doctor')
  @Roles('doctor')
  @ApiOperation({ summary: 'Mark patient as currently with doctor' })
  async markWithDoctor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.markWithDoctor(id, user.userId, user.facilityId);
  }

  // ── COMPLETE VISIT ─────────────────────────────────────────────────────────
  @Patch(':id/complete')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Mark visit as completed' })
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.complete(id, user.facilityId);
  }

  // ── CANCEL VISIT ───────────────────────────────────────────────────────────
  @Patch(':id/cancel')
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Cancel a visit (no-show / left)' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.visitsService.cancel(id, user.facilityId);
  }
}