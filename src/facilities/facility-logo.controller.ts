// src/facilities/facility-logo.controller.ts
import {
  Controller, Post, Delete, UseGuards,
  UseInterceptors, UploadedFile, ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FacilitiesService } from './facilities.service';
import { FilesService } from '../files/files.service';

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('facility-logo')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facilities/logo')
export class FacilityLogoController {
  constructor(
    private readonly facilitiesService: FacilitiesService,
    private readonly files: FilesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload or replace facility logo (owner/admin only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_SIZE },
  }))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    this.assertCanManageFacility(user);
    if (!file) throw new BadRequestException('No file provided');

    const facility = await this.facilitiesService.findOne(user.facilityId);
    const { key } = await this.files.store('logos', user.facilityId, file.buffer, file.mimetype, ALLOWED_MIME);
    const logoUrl = this.files.logoUrl(user.facilityId);

    await this.facilitiesService.update(user.facilityId, {
      logoUrl,
      logoKey:      key,
      logoPublicId: null,
    } as any);
    // The old file goes only once the new one is in place.
    await this.files.remove((facility as any).logoKey).catch(() => {});

    return { logoUrl, message: 'Logo uploaded successfully' };
  }

  @Delete()
  @ApiOperation({ summary: 'Remove facility logo (owner/admin only)' })
  async removeLogo(@CurrentUser() user: any) {
    this.assertCanManageFacility(user);
    const facility = await this.facilitiesService.findOne(user.facilityId);
    await this.facilitiesService.update(user.facilityId, {
      logoUrl:      null,
      logoKey:      null,
      logoPublicId: null,
    } as any);
    await this.files.remove((facility as any).logoKey).catch(() => {});
    return { message: 'Logo removed successfully' };
  }

  private assertCanManageFacility(user: any) {
    const isAdmin = user.role === 'facility_admin' || user.role === 'super_admin';
    if (!isAdmin && !user.isOwner) {
      throw new ForbiddenException('Only clinic owners and admins can manage the facility logo');
    }
  }
}
