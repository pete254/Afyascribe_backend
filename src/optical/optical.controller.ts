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
import { OpticalService } from './optical.service';
import { CreateOpticalDto } from './dto/create-optical.dto';
import { UpdateOpticalDto } from './dto/update-optical.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Optical / optometry — eye exams, spectacle prescriptions (refraction per eye)
 * and dispensing. Facility-scoped and role-guarded like the rest of the app.
 */
@ApiTags('optical')
@ApiBearerAuth('JWT-auth')
@Controller('optical')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'optometrist', 'facility_admin', 'super_admin')
export class OpticalController {
  constructor(private readonly service: OpticalService) {}

  @Post()
  @ApiOperation({ summary: 'Start an optical record / eye exam' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateOpticalDto) {
    return this.service.create(facilityOf(user), dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "This facility's optical records (filterable by patient/status)" })
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
    @Body() dto: UpdateOpticalDto,
  ) {
    return this.service.update(facilityOf(user), id, dto, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.remove(facilityOf(user), id);
  }
}
