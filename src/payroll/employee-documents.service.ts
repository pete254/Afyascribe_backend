import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeDocument, EmployeeDocumentCategory } from './entities/employee-document.entity';
import { Employee } from './entities/employee.entity';
import { FilesService } from '../files/files.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class EmployeeDocumentsService {
  private readonly logger = new Logger(EmployeeDocumentsService.name);

  constructor(
    @InjectRepository(EmployeeDocument)
    private readonly repo: Repository<EmployeeDocument>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly files: FilesService,
  ) {}

  private validateFile(mimeType: string, fileSize: number) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('Unsupported file type. Allowed: JPEG, PNG, WebP, PDF');
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum size is 10MB');
    }
  }

  async upload(params: {
    employeeId: string;
    facilityId: string;
    uploadedById: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    fileSize: number;
    documentName: string;
    category?: EmployeeDocumentCategory;
    notes?: string;
  }): Promise<EmployeeDocument> {
    this.validateFile(params.mimeType, params.fileSize);

    const emp = await this.employees.findOne({
      where: { id: params.employeeId, facilityId: params.facilityId },
    });
    if (!emp) throw new BadRequestException('Employee not found in your facility');

    const { key, mime } = await this.files.store(
      'staff',
      params.facilityId,
      params.buffer,
      params.mimeType,
      ALLOWED_MIME_TYPES,
    );

    const doc = this.repo.create({
      employeeId: params.employeeId,
      facilityId: params.facilityId,
      uploadedById: params.uploadedById,
      documentName: params.documentName,
      category: params.category ?? EmployeeDocumentCategory.OTHER,
      notes: params.notes ?? null,
      storageKey: key,
      fileUrl: null,
      publicId: null,
      fileName: params.originalName,
      fileType: mime,
      fileSize: params.fileSize,
    });
    return this.repo.save(doc);
  }

  findForEmployee(employeeId: string, facilityId: string): Promise<EmployeeDocument[]> {
    return this.repo.find({
      where: { employeeId, facilityId },
      order: { createdAt: 'DESC' },
    });
  }

  async remove(id: string, facilityId: string): Promise<void> {
    const doc = await this.repo.findOne({ where: { id, facilityId } });
    if (!doc) throw new NotFoundException('Document not found');
    // Record first: a stray file is harmless, a record without its file is not.
    await this.repo.remove(doc);
    await this.files.remove(doc.storageKey).catch((e) =>
      this.logger.warn(`File delete failed (record already removed): ${(e as Error).message}`),
    );
  }
}
