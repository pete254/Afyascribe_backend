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
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PatientResponseDto } from './dto/patient-response.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { plainToInstance } from 'class-transformer';

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
      'Creates a new patient. patientId is auto-generated (TCC/YYYY/NNNNN) — never send it from the client.',
  })
  @ApiResponse({ status: 201, description: 'Patient registered successfully', type: PatientResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPatient(@Body() dto: CreatePatientDto) {
    const patient = await this.patientsService.createPatient(dto);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── SEARCH ────────────────────────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Search patients by name or patient ID' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)', example: 'Wanjiru' })
  @ApiResponse({ status: 200, type: [PatientResponseDto] })
  async searchPatients(@Query('q') query: string) {
    const patients = await this.patientsService.searchPatients(query);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  // ── RECENT ────────────────────────────────────────────────────────────────

  @Get('recent')
  @ApiOperation({ summary: 'Get recently registered patients (last 14 days)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, type: [PatientResponseDto] })
  async getRecentPatients(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const patients = await this.patientsService.getRecentPatients(limit);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  // ── ALL (paginated) ───────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get all patients with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async getAllPatients(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const result = await this.patientsService.getAllPatients(page, limit);
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
  async getPatientById(@Param('id') id: string) {
    const patient = await this.patientsService.getPatientById(id);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── BY HOSPITAL PATIENT ID ────────────────────────────────────────────────

  @Get('patient-id/:patientId')
  @ApiOperation({ summary: 'Get a patient by hospital patient ID' })
  @ApiResponse({ status: 200, type: PatientResponseDto })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getPatientByPatientId(@Param('patientId') patientId: string) {
    const patient = await this.patientsService.getPatientByPatientId(patientId);
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
  ) {
    const patient = await this.patientsService.updatePatient(id, updatePatientDto);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // ── SEARCH BY PHONE ───────────────────────────────────────────────────────

  @Get('search/phone')
  @ApiOperation({ summary: 'Search patients by phone number' })
  @ApiQuery({ name: 'q', required: true, description: 'Phone number (min 3 chars)' })
  @ApiResponse({ status: 200, description: 'List of matching patients', type: [PatientResponseDto] })
  async searchByPhone(@Query('q') query: string) {
    const patients = await this.patientsService.searchByPhone(query);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  // ── DEV SEED ──────────────────────────────────────────────────────────────


}