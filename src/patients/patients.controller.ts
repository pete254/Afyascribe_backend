// src/patients/patients.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PatientResponseDto } from './dto/patient-response.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';

@ApiTags('patients')
@Controller('patients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // ── CREATE ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Register a new patient',
    description:
      'Creates a new patient scoped to the calling user\'s facility. patientId is auto-generated ({FACILITY_CODE}/YYYY/NNNNN).',
  })
  @ApiResponse({ status: 201, description: 'Patient registered successfully', type: PatientResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPatient(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patient = await this.patientsService.createPatient(
      dto,
      user.facilityId,
      user.facilityCode,
    );
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── SEARCH ────────────────────────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Search patients by name or patient ID (scoped to your facility)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)', example: 'Wanjiru' })
  @ApiResponse({ status: 200, type: [PatientResponseDto] })
  async searchPatients(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patients = await this.patientsService.searchPatients(query, user.facilityId);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  // ── RECENT ────────────────────────────────────────────────────────────────

  @Get('recent')
  @ApiOperation({ summary: 'Get recently registered patients (last 12 months, scoped to your facility)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, type: [PatientResponseDto] })
  async getRecentPatients(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patients = await this.patientsService.getRecentPatients(user.facilityId, limit);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  // ── ALL (paginated) ───────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get all patients with pagination (scoped to your facility)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async getAllPatients(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.patientsService.getAllPatients(user.facilityId, page, limit);
    return {
      ...result,
      data: plainToInstance(PatientResponseDto, result.data, {
        excludeExtraneousValues: true,
      }),
    };
  }

  // ── BY UUID ───────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single patient by UUID' })
  @ApiResponse({ status: 200, type: PatientResponseDto })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getPatientById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patient = await this.patientsService.getPatientById(id, user.facilityId);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── BY HOSPITAL PATIENT ID ────────────────────────────────────────────────

  @Get('patient-id/:patientId')
  @ApiOperation({ summary: 'Get a patient by hospital patient ID (e.g. KNH/2026/00042)' })
  @ApiResponse({ status: 200, type: PatientResponseDto })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getPatientByPatientId(
    @Param('patientId') patientId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patient = await this.patientsService.getPatientByPatientId(patientId, user.facilityId);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Update patient details' })
  @ApiResponse({ status: 200, description: 'Patient updated successfully', type: PatientResponseDto })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async updatePatient(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patient = await this.patientsService.updatePatient(id, updatePatientDto, user.facilityId);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── SEARCH BY PHONE ───────────────────────────────────────────────────────

  @Get('search/phone')
  @ApiOperation({ summary: 'Search patients by phone number (scoped to your facility)' })
  @ApiQuery({ name: 'q', required: true, description: 'Phone number (min 3 chars)' })
  @ApiResponse({ status: 200, description: 'List of matching patients', type: [PatientResponseDto] })
  async searchByPhone(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const patients = await this.patientsService.searchByPhone(query, user.facilityId);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }
}