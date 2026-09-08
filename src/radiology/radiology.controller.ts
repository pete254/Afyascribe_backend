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
import { RadiologyService } from './radiology.service';
import { CreateRadiologyDto } from './dto/create-radiology.dto';
import { UpdateRadiologyDto } from './dto/update-radiology.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Radiology / imaging — request, schedule and report studies. Facility-scoped
 * and role-guarded like the rest of the app: clinical + radiography roles (and
 * owners, who are doctors) so a solo clinic can run the whole flow.
 */
@ApiTags('radiology')
@ApiBearerAuth('JWT-auth')
@Controller('radiology')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'radiographer', 'facility_admin', 'super_admin')
export class RadiologyController {
  constructor(private readonly service: RadiologyService) {}

  @Post()
  @ApiOperation({ summary: 'Request an imaging study' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateRadiologyDto) {
    return this.service.create(facilityOf(user), dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "This facility's imaging studies (filterable by patient/status)" })
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
    @Body() dto: UpdateRadiologyDto,
  ) {
    return this.service.update(facilityOf(user), id, dto, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.remove(facilityOf(user), id);
  }
}
