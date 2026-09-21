// src/service-catalog/service-catalog.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ServiceCatalogService } from './service-catalog.service';
import {
  CreateServiceCatalogDto,
  UpdateServiceCatalogDto,
  ImportIchiDto,
} from './dto/service-catalog.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('service-catalog')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly service: ServiceCatalogService) {}

  // ── GET all (all authenticated staff can read) ────────────────────────────
  @Get()
  @Roles('doctor', 'nurse', 'receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Get service catalog for the facility' })
  @ApiQuery({ name: 'all', required: false, description: 'Pass true to include inactive items' })
  findAll(@CurrentUser() user: any, @Query('all') all?: string) {
    return this.service.findAll(user.facilityId, all !== 'true');
  }

  // ── SEED defaults ─────────────────────────────────────────────────────────
  @Post('seed-defaults')
  @Roles('facility_admin', 'super_admin','doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'Seed default services into the catalog (safe to run multiple times)' })
  async seedDefaults(@CurrentUser() user: any) {
    await this.service.seedDefaults(user.facilityId);
    return { message: 'Default services seeded successfully' };
  }

  // ── IMPORT a national procedure list (WHO ICHI via KNHTS) ─────────────────
  @Post('import-ichi')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({
    summary: 'Import an ICHI section as catalogue items (background)',
    description: '"dental" = teeth + gums interventions (active); "eye" = the eye chapter (inactive, activate what you offer). Skips codes already present.',
  })
  importIchi(@CurrentUser() user: any, @Body() body: ImportIchiDto) {
    this.service.importIchiSection(user.facilityId, body.section).catch(() => undefined);
    return { started: true, section: body.section };
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  @Post()
  @Roles('facility_admin', 'super_admin','doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'Add a service to the catalog' })
  create(@Body() dto: CreateServiceCatalogDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.facilityId);
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles('facility_admin', 'super_admin','doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'Update a catalog service' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceCatalogDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.facilityId);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Remove a service from the catalog' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.facilityId);
  }

  // ── REORDER ───────────────────────────────────────────────────────────────
  @Patch('bulk/reorder')
  @Roles('facility_admin', 'super_admin','doctor', 'nurse', 'receptionist')
  @ApiOperation({ summary: 'Reorder catalog items' })
  reorder(
    @Body() body: { items: { id: string; sortOrder: number }[] },
    @CurrentUser() user: any,
  ) {
    return this.service.reorder(body.items, user.facilityId);
  }
}