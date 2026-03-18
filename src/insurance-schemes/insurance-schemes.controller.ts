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

  @Get()
  @Roles('receptionist', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get all insurance schemes for the facility' })
  @ApiQuery({ name: 'all', required: false, description: 'Pass true to include inactive schemes' })
  findAll(@CurrentUser() user: any, @Query('all') all?: string) {
    return this.service.findAll(user.facilityId, all !== 'true');
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