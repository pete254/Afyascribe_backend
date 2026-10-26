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
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDocumentCategory } from './entities/employee-document.entity';
import { FilesService } from '../files/files.service';
import { MAX_UPLOAD_BYTES } from '../files/file-store';

type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const fileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

@ApiTags('employee-documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'hr_manager', 'accountant')
@Controller('employee-documents')
export class EmployeeDocumentsController {
  constructor(
    private readonly service: EmployeeDocumentsService,
    private readonly files: FilesService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Upload a document to an employee's HR profile" })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  async upload(
    @UploadedFile() file: UploadedMulterFile,
    @Body('employeeId') employeeId: string,
    @Body('documentName') documentName: string,
    @Body('category') category: EmployeeDocumentCategory,
    @Body('notes') notes: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!employeeId) throw new BadRequestException('employeeId is required');
    if (!documentName) throw new BadRequestException('documentName is required');

    const doc = await this.service.upload({
      employeeId,
      facilityId: facilityOf(user),
      uploadedById: user.id,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      documentName,
      category,
      notes,
    });
    return this.files.withLinks('staff', [doc], user.id)[0];
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: "An employee's documents" })
  findForEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service
      .findForEmployee(employeeId, facilityOf(user))
      .then((docs) => this.files.withLinks('staff', docs, user.id));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee document' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserType) {
    await this.service.remove(id, facilityOf(user));
    return { message: 'Document deleted' };
  }
}
