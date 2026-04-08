// src/appointments/appointments.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('appointments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Post()
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Create an appointment (from doctor after SOAP note)' })
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id, user.facilityId);
  }

  @Get('my-today')
  @Roles('doctor')
  @ApiOperation({ summary: "Get today's appointments for the logged-in doctor" })
  getMyToday(@CurrentUser() user: any) {
    return this.service.getTodayForDoctor(user.id, user.facilityId);
  }

  @Get('facility')
  @Roles('receptionist', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get all appointments for the facility' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
  getAllForFacility(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.service.getAllForFacility(user.facilityId, date);
  }

  @Get('patient/:patientId')
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: "Get all appointments for a patient" })
  getForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.getForPatient(patientId, user.facilityId);
  }

  @Patch(':id')
  @Roles('doctor', 'facility_admin', 'super_admin', 'receptionist')
  @ApiOperation({ summary: 'Update appointment (status, date, time, etc.)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.facilityId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('doctor', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Delete an appointment' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.facilityId);
  }
}