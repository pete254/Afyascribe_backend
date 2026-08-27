import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { EmployeeDocument, EmployeeDocumentCategory } from './entities/employee-document.entity';
import { Employee } from './entities/employee.entity';

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
    private readonly config: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  private async uploadToCloudinary(
    buffer: Buffer,
    mimeType: string,
    folder: string,
  ): Promise<{ url: string; publicId: string }> {
    const isPdf = mimeType === 'application/pdf';
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: isPdf ? 'raw' : 'image' },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload error', error as Error);
            reject(new BadRequestException(`Upload failed: ${error?.message ?? 'unknown'}`));
          } else {
            resolve({ url: result.secure_url, publicId: result.public_id });
          }
        },
      );
      stream.end(buffer);
    });
  }

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

    const { url, publicId } = await this.uploadToCloudinary(
      params.buffer,
      params.mimeType,
      `afyascribe/${params.facilityId}/employees/${params.employeeId}/docs`,
    );

    const doc = this.repo.create({
      employeeId: params.employeeId,
      facilityId: params.facilityId,
      uploadedById: params.uploadedById,
      documentName: params.documentName,
      category: params.category ?? EmployeeDocumentCategory.OTHER,
      notes: params.notes ?? null,
      fileUrl: url,
      publicId,
      fileName: params.originalName,
      fileType: params.mimeType,
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
    const isPdf = doc.fileType === 'application/pdf';
    try {
      await cloudinary.uploader.destroy(doc.publicId, {
        resource_type: isPdf ? 'raw' : 'image',
      });
    } catch (e) {
      this.logger.warn(`Cloudinary destroy failed for ${doc.publicId}: ${(e as Error).message}`);
    }
    await this.repo.remove(doc);
  }
}
