// src/facilities/facilities.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilityResponseDto } from './dto/facility-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  // ── CREATE ────────────────────────────────────────────────────────────────
  @Post()
  @Roles('super_admin')
  @ApiOperation({ summary: 'Register a new facility (super_admin only)' })
  @ApiResponse({ status: 201, type: FacilityResponseDto })
  @ApiResponse({ status: 409, description: 'Facility code already exists' })
  async create(@Body() dto: CreateFacilityDto) {
    const facility = await this.facilitiesService.create(dto);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── LIST ALL ──────────────────────────────────────────────────────────────
  @Get()
  @Roles('super_admin')
  @ApiOperation({ summary: 'List all facilities (super_admin only)' })
  @ApiResponse({ status: 200, type: [FacilityResponseDto] })
  async findAll() {
    const facilities = await this.facilitiesService.findAll();
    return plainToInstance(FacilityResponseDto, facilities, {
      excludeExtraneousValues: true,
    });
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────
  @Get(':id')
  @Roles('super_admin', 'facility_admin')
  @ApiOperation({ summary: 'Get a single facility by UUID' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  @ApiResponse({ status: 404, description: 'Facility not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const facility = await this.facilitiesService.findOne(id);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── GET STATS ─────────────────────────────────────────────────────────────
  @Get(':id/stats')
  @Roles('super_admin', 'facility_admin')
  @ApiOperation({ summary: 'Get user and patient counts for a facility' })
  async getStats(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.facilitiesService.getStats(id);
    return {
      ...result,
      facility: plainToInstance(FacilityResponseDto, result.facility, {
        excludeExtraneousValues: true,
      }),
    };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Update a facility (super_admin only)' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFacilityDto,
  ) {
    const facility = await this.facilitiesService.update(id, dto);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }

  // ── DEACTIVATE ────────────────────────────────────────────────────────────
  @Patch(':id/deactivate')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Deactivate a facility (super_admin only)' })
  @ApiResponse({ status: 200, type: FacilityResponseDto })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    const facility = await this.facilitiesService.deactivate(id);
    return plainToInstance(FacilityResponseDto, facility, {
      excludeExtraneousValues: true,
    });
  }
}