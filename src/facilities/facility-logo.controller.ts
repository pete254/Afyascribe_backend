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
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FacilitiesService } from './facilities.service';

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('facility-logo')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facilities/logo')
export class FacilityLogoController {
  constructor(
    private readonly facilitiesService: FacilitiesService,
    private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

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
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or WebP images are allowed');
    }

    const facility = await this.facilitiesService.findOne(user.facilityId);

    // Delete old logo from Cloudinary if it exists
    if ((facility as any).logoPublicId) {
      await cloudinary.uploader.destroy((facility as any).logoPublicId).catch(() => {});
    }

    // Upload new logo
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `afyascribe/logos/${user.facilityId}`,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, res) => (err ? reject(err) : resolve(res)),
      ).end(file.buffer);
    });

    await this.facilitiesService.update(user.facilityId, {
      logoUrl:      result.secure_url,
      logoPublicId: result.public_id,
    } as any);

    return { logoUrl: result.secure_url, message: 'Logo uploaded successfully' };
  }

  @Delete()
  @ApiOperation({ summary: 'Remove facility logo (owner/admin only)' })
  async removeLogo(@CurrentUser() user: any) {
    this.assertCanManageFacility(user);
    const facility = await this.facilitiesService.findOne(user.facilityId);
    if ((facility as any).logoPublicId) {
      await cloudinary.uploader.destroy((facility as any).logoPublicId).catch(() => {});
    }
    await this.facilitiesService.update(user.facilityId, {
      logoUrl:      null,
      logoPublicId: null,
    } as any);
    return { message: 'Logo removed successfully' };
  }

  private assertCanManageFacility(user: any) {
    const isAdmin = user.role === 'facility_admin' || user.role === 'super_admin';
    if (!isAdmin && !user.isOwner) {
      throw new ForbiddenException('Only clinic owners and admins can manage the facility logo');
    }
  }
}
