import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { DentalService } from './dental.service';
import { CreateDentalDto } from './dto/create-dental.dto';
import { UpdateDentalDto } from './dto/update-dental.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Dental — chart teeth, record procedures (exam, scaling, filling, extraction,
 * root canal…), move them through the workflow and bill them. Facility-scoped
 * and role-guarded like the rest of the app.
 */
@ApiTags('dental')
@ApiBearerAuth('JWT-auth')
@Controller('dental')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'dentist', 'facility_admin', 'super_admin')
export class DentalController {
  constructor(private readonly service: DentalService) {}

  @Post()
  @ApiOperation({ summary: 'Record a dental treatment / procedure' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateDentalDto) {
    return this.service.create(facilityOf(user), dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "This facility's dental treatments (filterable by patient/status)" })
  findAll(
    @CurrentUser() user: CurrentUserType,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(facilityOf(user), { patientId, status });
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.findOne(facilityOf(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: UpdateDentalDto,
  ) {
    return this.service.update(facilityOf(user), id, dto, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.remove(facilityOf(user), id);
  }
}
