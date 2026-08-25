import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InsuranceSchemesService } from './insurance-schemes.service';
import { CreateInsuranceSchemeDto, UpdateInsuranceSchemeDto } from './dto/insurance-scheme.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('insurance-schemes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance-schemes')
export class InsuranceSchemesController {
  constructor(private readonly service: InsuranceSchemesService) {}

  @Post()
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Register a new insurance scheme for the facility' })
  create(@Body() dto: CreateInsuranceSchemeDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.facilityId);
  }

  @Post('seed')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Seed the main Kenyan insurers for the facility (idempotent)' })
  seed(@CurrentUser() user: any) {
    return this.service.seedForFacility(user.facilityId);
  }

  @Get()
  @Roles('receptionist', 'facility_admin', 'super_admin', 'doctor', 'nurse', 'cashier', 'accountant')
  @ApiOperation({ summary: 'Get all insurance schemes for the facility' })
  @ApiQuery({ name: 'all', required: false, description: 'Pass true to include inactive schemes' })
  @ApiQuery({ name: 'type', required: false, enum: ['insurer', 'corporate'], description: 'Filter by payer type' })
  findAll(
    @CurrentUser() user: any,
    @Query('all') all?: string,
    @Query('type') type?: 'insurer' | 'corporate',
  ) {
    return this.service.findAll(
      user.facilityId,
      all !== 'true',
      type === 'insurer' || type === 'corporate' ? type : undefined,
    );
  }

  @Get('corporate-receivables')
  @Roles('facility_admin', 'super_admin', 'accountant', 'cashier')
  @ApiOperation({ summary: 'Corporate AR register: every corporate payer with billed, settled and outstanding' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — start of range' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — end of range' })
  corporateReceivables(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.corporateReceivables(
      user.facilityId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id/ledger')
  @Roles('facility_admin', 'super_admin', 'accountant', 'cashier')
  @ApiOperation({ summary: 'Transaction ledger for one insurer (all insurance-funded charges)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — start of range' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — end of range' })
  ledger(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.ledger(
      id,
      user.facilityId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Patch(':id')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Update an insurance scheme' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInsuranceSchemeDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.facilityId);
  }

  @Delete(':id')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Delete an insurance scheme' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.facilityId);
  }
}