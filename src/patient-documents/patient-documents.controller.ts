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
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Multer } from 'multer';
import { PatientDocumentsService } from './patient-documents.service';
import { DocumentCategory } from './entities/patient-document.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('patient-documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient-documents')
export class PatientDocumentsController {
  constructor(private readonly documentsService: PatientDocumentsService) {}

  // ── UPLOAD ─────────────────────────────────────────────────────────────────
  @Post('upload')
  @ApiOperation({ summary: 'Upload a document (image or PDF) for a patient' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        patientId: { type: 'string' },
        category: { type: 'string', enum: Object.values(DocumentCategory) },
        notes: { type: 'string' },
      },
      required: ['file', 'patientId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Keep in memory for Cloudinary upload
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async upload(
    @UploadedFile() file: Multer.File,
    @Body('patientId') patientId: string,
    @Body('category') category: DocumentCategory,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!patientId) {
      throw new BadRequestException('patientId is required');
    }

    return this.documentsService.uploadDocument(
      patientId,
      user.facilityId,
      user.id,
      file.buffer,
      file.originalname,
      file.mimetype,
      file.size,
      category,
      notes,
    );
  }

  // ── GET BY PATIENT ─────────────────────────────────────────────────────────
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all documents for a patient' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  findByPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findByPatient(patientId, user.facilityId);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.documentsService.remove(id, user.facilityId);
    return { message: 'Document deleted successfully' };
  }
}