// src/soap-notes/soap-notes.controller.ts
// UPDATED: All endpoints now pass facilityId from JWT via @CurrentUser()
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { SoapNotesService } from './soap-notes.service';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { UpdateSoapNoteStatusDto } from './dto/update-soap-note-status.dto';
import { QuerySoapNotesDto } from './dto/query-soap-notes.dto';

@ApiTags('soap-notes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('soap-notes')
export class SoapNotesController {
  constructor(private readonly soapNotesService: SoapNotesService) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Create a new SOAP note' })
  @ApiResponse({ status: 201, description: 'SOAP note created successfully' })
  create(
    @Body() createSoapNoteDto: CreateSoapNoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.create(createSoapNoteDto, user.id, user.facilityId);
  }

  // ── SAVE / UPDATE DRAFT ────────────────────────────────────────────────────
  // POST /soap-notes/draft            → create new draft
  // POST /soap-notes/draft/:id        → update existing draft

  @Post('draft')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Create a new SOAP note draft' })
  saveDraft(
    @Body() dto: CreateSoapNoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.saveDraft(dto, user.id, user.facilityId);
  }

  @Post('draft/:id')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Update an existing SOAP note draft' })
  updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSoapNoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.saveDraft(dto, user.id, user.facilityId, id);
  }

  // ── GET MY DRAFTS ──────────────────────────────────────────────────────────

  @Get('drafts')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: "Get the current user's SOAP note drafts" })
  getMyDrafts(@CurrentUser() user: CurrentUserType) {
    return this.soapNotesService.getMyDrafts(user.id, user.facilityId);
  }

  // ── FINALISE DRAFT → status becomes 'pending' ──────────────────────────────

  @Post('draft/:id/finalise')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Finalise a draft — saves it as a completed SOAP note' })
  finaliseDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSoapNoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.finaliseDraft(id, dto, user.id, user.facilityId);
  }

  // ── DELETE DRAFT ───────────────────────────────────────────────────────────

  @Delete('draft/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Delete a draft' })
  deleteDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.deleteDraft(id, user.id, user.facilityId);
  }

  // ── LIST (own notes, scoped to facility) ───────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get my SOAP notes (scoped to facility)' })
  findAll(
    @Query() queryDto: QuerySoapNotesDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.findAll(user.id, user.facilityId, queryDto);
  }

  // ── LIST ALL IN FACILITY (facility_admin / super_admin only) ───────────────

  @Get('facility-all')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Get all SOAP notes in facility (admin only)' })
  findAllForFacility(
    @Query() queryDto: QuerySoapNotesDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.findAllForFacility(user.facilityId, queryDto);
  }

  // ── STATISTICS ─────────────────────────────────────────────────────────────

  @Get('statistics')
  @ApiOperation({ summary: 'Get my SOAP note statistics' })
  getStatistics(@CurrentUser() user: CurrentUserType) {
    return this.soapNotesService.getStatistics(user.id, user.facilityId);
  }

  // ── BY PATIENT ─────────────────────────────────────────────────────────────

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all SOAP notes for a patient (scoped to facility)' })
  getPatientHistory(
    @Param('patientId') patientId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.findByPatient(patientId, user.facilityId);
  }

  // ── FIND ONE ───────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific SOAP note' })
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.soapNotesService.findOne(id, user.id, user.facilityId);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Update a SOAP note' })
  update(
    @Param('id') id: string,
    @Body() updateSoapNoteDto: UpdateSoapNoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.update(id, updateSoapNoteDto, user.id, user.facilityId);
  }

  // ── EDIT WITH HISTORY ──────────────────────────────────────────────────────

  @Patch(':id/edit')
  @Roles('doctor', 'nurse', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Edit a SOAP note with history tracking' })
  editNoteWithHistory(
    @Param('id') id: string,
    @Body() updateData: {
      symptoms?: string;
      physicalExamination?: string;
      labInvestigations?: string;
      imaging?: string;
      diagnosis?: string;
      icd10Code?: string;
      icd10Description?: string;
      management?: string;
    },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.editWithHistory(
      id,
      updateData,
      user.id,
      `${user.firstName} ${user.lastName}`,
      user.facilityId,
    );
  }

  // ── STATUS ─────────────────────────────────────────────────────────────────

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update SOAP note status' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateSoapNoteStatusDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.soapNotesService.updateStatus(id, updateStatusDto.status, user.id, user.facilityId);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('doctor', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Delete a SOAP note' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.soapNotesService.remove(id, user.id, user.facilityId);
  }
}