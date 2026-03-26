// src/patient-documents/patient-documents.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { PatientDocument, DocumentCategory } from './entities/patient-document.entity';
import { PatientsService } from '../patients/patients.service';

@Injectable()
export class PatientDocumentsService {
  private readonly logger = new Logger(PatientDocumentsService.name);

  constructor(
    @InjectRepository(PatientDocument)
    private readonly documentsRepo: Repository<PatientDocument>,
    private readonly patientsService: PatientsService,
    private readonly configService: ConfigService,
  ) {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  // ── UPLOAD DOCUMENT ────────────────────────────────────────────────────────
  async uploadDocument(
    patientId: string,
    facilityId: string,
    uploadedById: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    fileSize: number,
    category: DocumentCategory = DocumentCategory.OTHER,
    notes?: string,
  ): Promise<PatientDocument> {
    // Verify patient belongs to this facility
    const patientExists = await this.patientsService.patientExists(patientId, facilityId);
    if (!patientExists) {
      throw new BadRequestException(`Patient ${patientId} not found in your facility`);
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedTypes.includes(mimeType)) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: JPEG, PNG, WebP, PDF',
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      throw new BadRequestException('File too large. Maximum size is 10MB');
    }

    this.logger.log(`📤 Uploading document for patient ${patientId} | type: ${mimeType} | size: ${fileSize} bytes`);

    // Upload to Cloudinary
    const isPdf = mimeType === 'application/pdf';
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `afyascribe/${facilityId}/patients/${patientId}`,
          resource_type: isPdf ? 'raw' : 'image',
          // For images: auto-quality, auto-format
          ...(isPdf ? {} : {
            quality: 'auto',
            fetch_format: 'auto',
          }),
        },
        (error, result) => {
          if (error) {
            this.logger.error('❌ Cloudinary upload error:', error);
            reject(new BadRequestException(`Upload failed: ${error.message}`));
          } else {
            resolve(result);
          }
        },
      );
      uploadStream.end(fileBuffer);
    });

    this.logger.log(`✅ Cloudinary upload complete: ${uploadResult.public_id}`);

    // Save to database
    const document = this.documentsRepo.create({
      patientId,
      facilityId,
      uploadedById,
      fileUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: originalName,
      fileType: mimeType,
      fileSize,
      category,
      notes: notes ?? null,
    });

    return this.documentsRepo.save(document);
  }

  // ── GET ALL DOCUMENTS FOR A PATIENT ───────────────────────────────────────
  async findByPatient(
    patientId: string,
    facilityId: string,
  ): Promise<PatientDocument[]> {
    const patientExists = await this.patientsService.patientExists(patientId, facilityId);
    if (!patientExists) {
      throw new NotFoundException(`Patient ${patientId} not found in your facility`);
    }

    return this.documentsRepo.find({
      where: { patientId, facilityId },
      relations: ['uploadedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── GET SINGLE DOCUMENT ────────────────────────────────────────────────────
  async findOne(id: string, facilityId: string): Promise<PatientDocument> {
    const doc = await this.documentsRepo.findOne({
      where: { id, facilityId },
      relations: ['uploadedBy'],
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  // ── DELETE DOCUMENT ────────────────────────────────────────────────────────
  async remove(id: string, facilityId: string): Promise<void> {
    const doc = await this.findOne(id, facilityId);

    // Delete from Cloudinary
    try {
      const isPdf = doc.fileType === 'application/pdf';
      await cloudinary.uploader.destroy(doc.publicId, {
        resource_type: isPdf ? 'raw' : 'image',
      });
      this.logger.log(`🗑️ Cloudinary file deleted: ${doc.publicId}`);
    } catch (error) {
      this.logger.warn(`⚠️ Could not delete from Cloudinary: ${error.message}`);
      // Don't block DB deletion if Cloudinary fails
    }

    await this.documentsRepo.remove(doc);
    this.logger.log(`🗑️ Document record deleted: ${id}`);
  }
}