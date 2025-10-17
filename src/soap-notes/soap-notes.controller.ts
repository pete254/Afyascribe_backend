// src/soap-notes/soap-notes.controller.ts
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
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SoapNotesService } from './soap-notes.service';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { UpdateSoapNoteStatusDto } from './dto/update-soap-note-status.dto';
import { QuerySoapNotesDto } from './dto/query-soap-notes.dto';
import { 
  ApiTags, 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('soap-notes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('soap-notes')
export class SoapNotesController {
  constructor(private readonly soapNotesService: SoapNotesService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new SOAP note',
    description: 'Create a SOAP note linked to an existing patient. All four sections are required.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'SOAP note created successfully',
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data or patient not found' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  create(@Body() createSoapNoteDto: CreateSoapNoteDto, @Request() req) {
    return this.soapNotesService.create(createSoapNoteDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all SOAP notes for current user',
    description: 'Returns paginated list of SOAP notes with patient information.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns paginated SOAP notes with patient details',
  })
  findAll(@Query() queryDto: QuerySoapNotesDto, @Request() req) {
    return this.soapNotesService.findAll(req.user.userId, queryDto);
  }

  @Get('statistics')
  @ApiOperation({ 
    summary: 'Get SOAP notes statistics',
    description: 'Returns statistics about SOAP notes for the current user'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns statistics',
  })
  getStatistics(@Request() req) {
    return this.soapNotesService.getStatistics(req.user.userId);
  }

  // 🆕 NEW: Get all SOAP notes for a specific patient
  @Get('patient/:patientId')
  @ApiOperation({ 
    summary: 'Get all SOAP notes for a specific patient',
    description: 'Returns all notes for a patient, ordered by most recent first. Used for patient history view.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns all SOAP notes for the patient',
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Patient not found' 
  })
  async getPatientHistory(@Param('patientId') patientId: string) {
    return this.soapNotesService.findByPatient(patientId);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a specific SOAP note',
    description: 'Returns a single SOAP note with full patient and creator information'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns the SOAP note with patient details' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  findOne(@Param('id') id: string, @Request() req) {
    return this.soapNotesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update a SOAP note',
    description: 'Update any section of a SOAP note. Automatically marks note as edited if content is changed.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'SOAP note updated successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  update(
    @Param('id') id: string,
    @Body() updateSoapNoteDto: UpdateSoapNoteDto,
    @Request() req
  ) {
    return this.soapNotesService.update(id, updateSoapNoteDto, req.user.userId);
  }

  // 🆕 NEW: Edit a note with history tracking
  @Patch(':id/edit')
  @ApiOperation({ 
    summary: 'Edit a SOAP note with history tracking',
    description: 'Allows any doctor to edit a note. Tracks who edited it and when. Preserves edit history.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Note edited successfully with history tracked' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  async editNoteWithHistory(
    @Param('id') id: string,
    @Body() updateData: { 
      symptoms?: string;
      physicalExamination?: string;
      diagnosis?: string;
      management?: string;
    },
    @Request() req
  ) {
    return this.soapNotesService.editWithHistory(
      id, 
      updateData, 
      req.user.userId,
      `${req.user.firstName} ${req.user.lastName}`
    );
  }

  @Patch(':id/status')
  @ApiOperation({ 
    summary: 'Update SOAP note status',
    description: 'Change the status of a SOAP note (pending, submitted, reviewed, archived)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Status updated successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateSoapNoteStatusDto,
    @Request() req
  ) {
    return this.soapNotesService.updateStatus(id, updateStatusDto.status, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete a SOAP note',
    description: 'Permanently delete a SOAP note'
  })
  @ApiResponse({ 
    status: 204, 
    description: 'SOAP note deleted successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  remove(@Param('id') id: string, @Request() req) {
    return this.soapNotesService.remove(id, req.user.userId);
  }
}