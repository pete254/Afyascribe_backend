// src/patient-documents/patient-documents.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PatientDocumentsService } from './patient-documents.service';
import { DocumentCategory } from './entities/patient-document.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const fileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

@ApiTags('patient-documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient-documents')
export class PatientDocumentsController {
  constructor(private readonly service: PatientDocumentsService) {}

  // ── UPLOAD: patient-level (onboarding) ────────────────────────────────────
  @Post('patient')
  @ApiOperation({ summary: 'Upload a patient-level document (permanent)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  async uploadPatientDoc(
    @UploadedFile() file: UploadedMulterFile,
    @Body('patientId') patientId: string,
    @Body('documentName') documentName: string,
    @Body('category') category: DocumentCategory,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    if (!file)         throw new BadRequestException('No file provided');
    if (!patientId)    throw new BadRequestException('patientId is required');
    if (!documentName) throw new BadRequestException('documentName is required');

    return this.service.uploadPatientDocument({
      patientId,
      facilityId:   user.facilityId,
      uploadedById: user.id,
      buffer:       file.buffer,
      originalName: file.originalname,
      mimeType:     file.mimetype,
      fileSize:     file.size,
      documentName,
      category,
      notes,
    });
  }

  // ── UPLOAD: SOAP note-level ───────────────────────────────────────────────
  @Post('soap-note')
  @ApiOperation({ summary: 'Upload a document tied to a specific SOAP note' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  async uploadSoapNoteDoc(
    @UploadedFile() file: UploadedMulterFile,
    @Body('patientId') patientId: string,
    @Body('soapNoteId') soapNoteId: string,
    @Body('documentName') documentName: string,
    @Body('category') category: DocumentCategory,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    if (!file)         throw new BadRequestException('No file provided');
    if (!patientId)    throw new BadRequestException('patientId is required');
    if (!soapNoteId)   throw new BadRequestException('soapNoteId is required');
    if (!documentName) throw new BadRequestException('documentName is required');

    return this.service.uploadSoapNoteDocument({
      patientId,
      soapNoteId,
      facilityId:   user.facilityId,
      uploadedById: user.id,
      buffer:       file.buffer,
      originalName: file.originalname,
      mimeType:     file.mimetype,
      fileSize:     file.size,
      documentName,
      category,
      notes,
    });
  }

  // ── GET: patient-level docs only ──────────────────────────────────────────
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get permanent patient-level documents' })
  findPatientDocs(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findPatientDocs(patientId, user.facilityId);
  }

  // ── GET: SOAP note docs ────────────────────────────────────────────────────
  @Get('soap-note/:soapNoteId')
  @ApiOperation({ summary: 'Get documents attached to a specific SOAP note' })
  findSoapNoteDocs(
    @Param('soapNoteId', ParseUUIDPipe) soapNoteId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findSoapNoteDocs(soapNoteId, user.facilityId);
  }

  // ── GET: all docs for patient (both scopes) ───────────────────────────────
  @Get('patient/:patientId/all')
  @ApiOperation({ summary: 'Get all documents for a patient (patient-level + note-level)' })
  findAllForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findAllForPatient(patientId, user.facilityId);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.service.remove(id, user.facilityId);
    return { message: 'Document deleted successfully' };
  }
}