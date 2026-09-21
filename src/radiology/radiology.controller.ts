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

  // ── Imaging exam catalogue (national, LOINC-coded) ──────────────────────────

  @Get('exams')
  @ApiOperation({ summary: "This facility's imaging exam catalogue" })
  listExams(@CurrentUser() user: CurrentUserType, @Query('activeOnly') activeOnly?: string) {
    return this.service.listExams(facilityOf(user), activeOnly === 'true');
  }

  @Patch('exams/:id')
  @Roles('radiographer', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Update an imaging exam (price / active / name)' })
  updateExam(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: { price?: number; isActive?: boolean; name?: string },
  ) {
    return this.service.updateExam(facilityOf(user), id, body);
  }

  // DESTRUCTIVE: wipe radiology studies + exams, import the national imaging list.
  @Post('exams/reset-from-knhts')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Wipe imaging studies + exams, then import the national KNHTS imaging exams' })
  async resetExams(@CurrentUser() user: CurrentUserType, @Body() body: { confirm?: string }) {
    if (body?.confirm !== 'RESET') {
      throw new BadRequestException('Send { "confirm": "RESET" } to wipe imaging studies and the exam catalogue.');
    }
    const facilityId = facilityOf(user);
    const purged = await this.service.resetCatalogue(facilityId);
    this.service.importExamsFromKnhts(facilityId).catch(() => undefined);
    return { purged, importStarted: true };
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
