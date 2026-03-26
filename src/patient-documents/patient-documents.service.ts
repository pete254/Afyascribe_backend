// src/patient-documents/patient-documents.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  PatientDocument,
  DocumentCategory,
  DocumentScope,
} from './entities/patient-document.entity';
import { PatientsService } from '../patients/patients.service';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class PatientDocumentsService {
  private readonly logger = new Logger(PatientDocumentsService.name);

  constructor(
    @InjectRepository(PatientDocument)
    private readonly repo: Repository<PatientDocument>,
    private readonly patientsService: PatientsService,
    private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  // ── SHARED: upload file to Cloudinary ─────────────────────────────────────
  private async uploadToCloudinary(
    buffer: Buffer,
    mimeType: string,
    folder: string,
  ): Promise<{ url: string; publicId: string }> {
    const isPdf = mimeType === 'application/pdf';

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: isPdf ? 'raw' : 'image',
          ...(isPdf ? {} : { quality: 'auto', fetch_format: 'auto' }),
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error('❌ Cloudinary upload error:', error);
            reject(new BadRequestException(`Upload failed: ${error?.message ?? 'unknown'}`));
          } else {
            resolve({ url: result.secure_url, publicId: result.public_id });
          }
        },
      );
      stream.end(buffer);
    });
  }

  // ── SHARED: validate file ──────────────────────────────────────────────────
  private validateFile(mimeType: string, fileSize: number) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('Unsupported file type. Allowed: JPEG, PNG, WebP, PDF');
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum size is 10MB');
    }
  }

  // ── UPLOAD: patient-level document ────────────────────────────────────────
  async uploadPatientDocument(params: {
    patientId: string;
    facilityId: string;
    uploadedById: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    fileSize: number;
    documentName: string;
    category?: DocumentCategory;
    notes?: string;
  }): Promise<PatientDocument> {
    this.validateFile(params.mimeType, params.fileSize);

    const exists = await this.patientsService.patientExists(params.patientId, params.facilityId);
    if (!exists) throw new BadRequestException(`Patient not found in your facility`);

    this.logger.log(`📤 Uploading patient doc: ${params.documentName} for patient ${params.patientId}`);

    const { url, publicId } = await this.uploadToCloudinary(
      params.buffer,
      params.mimeType,
      `afyascribe/${params.facilityId}/patients/${params.patientId}/docs`,
    );

    const doc = this.repo.create({
      patientId:    params.patientId,
      facilityId:   params.facilityId,
      uploadedById: params.uploadedById,
      soapNoteId:   null,
      scope:        DocumentScope.PATIENT,
      documentName: params.documentName,
      category:     params.category ?? DocumentCategory.OTHER,
      notes:        params.notes ?? null,
      fileUrl:      url,
      publicId,
      fileName:     params.originalName,
      fileType:     params.mimeType,
      fileSize:     params.fileSize,
    });

    return this.repo.save(doc);
  }

  // ── UPLOAD: SOAP note-level document ──────────────────────────────────────
  async uploadSoapNoteDocument(params: {
    patientId: string;
    soapNoteId: string;
    facilityId: string;
    uploadedById: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    fileSize: number;
    documentName: string;
    category?: DocumentCategory;
    notes?: string;
  }): Promise<PatientDocument> {
    this.validateFile(params.mimeType, params.fileSize);

    const exists = await this.patientsService.patientExists(params.patientId, params.facilityId);
    if (!exists) throw new BadRequestException(`Patient not found in your facility`);

    this.logger.log(`📤 Uploading SOAP note doc: ${params.documentName} for note ${params.soapNoteId}`);

    const { url, publicId } = await this.uploadToCloudinary(
      params.buffer,
      params.mimeType,
      `afyascribe/${params.facilityId}/patients/${params.patientId}/notes/${params.soapNoteId}`,
    );

    const doc = this.repo.create({
      patientId:    params.patientId,
      facilityId:   params.facilityId,
      uploadedById: params.uploadedById,
      soapNoteId:   params.soapNoteId,
      scope:        DocumentScope.SOAP_NOTE,
      documentName: params.documentName,
      category:     params.category ?? DocumentCategory.OTHER,
      notes:        params.notes ?? null,
      fileUrl:      url,
      publicId,
      fileName:     params.originalName,
      fileType:     params.mimeType,
      fileSize:     params.fileSize,
    });

    return this.repo.save(doc);
  }

  // ── GET: all patient-level documents ──────────────────────────────────────
  async findPatientDocs(patientId: string, facilityId: string): Promise<PatientDocument[]> {
    return this.repo.find({
      where: { patientId, facilityId, scope: DocumentScope.PATIENT, soapNoteId: IsNull() },
      relations: ['uploadedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── GET: all documents for a specific SOAP note ────────────────────────────
  async findSoapNoteDocs(soapNoteId: string, facilityId: string): Promise<PatientDocument[]> {
    return this.repo.find({
      where: { soapNoteId, facilityId, scope: DocumentScope.SOAP_NOTE },
      relations: ['uploadedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── GET: all documents for a patient (both scopes) for "All Documents" tab ─
  async findAllForPatient(patientId: string, facilityId: string): Promise<PatientDocument[]> {
    return this.repo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.uploadedBy', 'uploadedBy')
      .where('doc.patient_id = :patientId', { patientId })
      .andWhere('doc.facility_id = :facilityId', { facilityId })
      .orderBy('doc.created_at', 'DESC')
      .getMany();
  }

  // ── GET: documents grouped by SOAP note ids (for timeline view) ────────────
  async findBySoapNoteIds(
    soapNoteIds: string[],
    facilityId: string,
  ): Promise<Record<string, PatientDocument[]>> {
    if (!soapNoteIds.length) return {};

    const docs = await this.repo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.uploadedBy', 'uploadedBy')
      .where('doc.soap_note_id IN (:...ids)', { ids: soapNoteIds })
      .andWhere('doc.facility_id = :facilityId', { facilityId })
      .orderBy('doc.created_at', 'ASC')
      .getMany();

    // Group by soapNoteId
    return docs.reduce<Record<string, PatientDocument[]>>((acc, doc) => {
      const key = doc.soapNoteId!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  async remove(id: string, facilityId: string): Promise<void> {
    const doc = await this.repo.findOne({ where: { id, facilityId } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    try {
      const isPdf = doc.fileType === 'application/pdf';
      await cloudinary.uploader.destroy(doc.publicId, {
        resource_type: isPdf ? 'raw' : 'image',
      });
      this.logger.log(`🗑️ Cloudinary deleted: ${doc.publicId}`);
    } catch (e) {
      this.logger.warn(`⚠️ Cloudinary delete failed (continuing): ${e.message}`);
    }

    await this.repo.remove(doc);
    this.logger.log(`🗑️ Document record deleted: ${id}`);
  }
}