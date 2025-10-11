// src/patients/patients.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
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
import { plainToInstance } from 'class-transformer';

@ApiTags('patients')
@Controller('patients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search patients by name or patient ID',
    description:
      'Search for patients using their first name, last name, full name, or hospital patient ID. Returns up to 20 matching results.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query (minimum 2 characters)',
    example: 'John',
  })
  @ApiResponse({
    status: 200,
    description: 'List of matching patients',
    type: [PatientResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async searchPatients(@Query('q') query: string) {
    const patients = await this.patientsService.searchPatients(query);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Get recently registered patients',
    description:
      'Returns patients registered in the last 7 days, ordered by registration date (most recent first).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of patients to return',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'List of recently registered patients',
    type: [PatientResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getRecentPatients(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const patients = await this.patientsService.getRecentPatients(limit);
    return plainToInstance(PatientResponseDto, patients, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Get all patients with pagination',
    description: 'Returns paginated list of all patients, ordered by name.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of patients',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            patientId: 'P-2024-001',
            firstName: 'John',
            lastName: 'Doe',
            fullName: 'John Doe',
            age: 45,
            gender: 'male',
            registeredAt: '2024-01-15T10:00:00Z',
          },
        ],
        total: 100,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single patient by ID',
    description:
      'Returns detailed information about a specific patient, including their SOAP notes count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Patient details',
    type: PatientResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Patient not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPatientById(@Param('id') id: string) {
    const patient = await this.patientsService.getPatientById(id);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  @Get('patient-id/:patientId')
  @ApiOperation({
    summary: 'Get a patient by hospital patient ID',
    description:
      'Returns patient information using their hospital-assigned patient ID (e.g., P-2024-001).',
  })
  @ApiResponse({
    status: 200,
    description: 'Patient details',
    type: PatientResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Patient not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPatientByPatientId(@Param('patientId') patientId: string) {
    const patient =
      await this.patientsService.getPatientByPatientId(patientId);
    return plainToInstance(PatientResponseDto, patient, {
      excludeExtraneousValues: true,
    });
  }

  // DEVELOPMENT ONLY - Seed dummy patients
  @Get('dev/seed')
  @ApiOperation({
    summary: '[DEV ONLY] Seed dummy patients',
    description:
      'Creates dummy patient data for testing. Only works if database is empty. Should be removed in production.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dummy patients created',
  })
  async seedDummyPatients() {
    const patients = await this.patientsService.seedDummyPatients();
    return {
      message: patients.length
        ? `Seeded ${patients.length} dummy patients`
        : 'Patients already exist. No seed performed.',
      count: patients.length,
    };
  }
}