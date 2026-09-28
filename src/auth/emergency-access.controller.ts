import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { EMERGENCY_ACCESS_HOURS, EmergencyAccessService } from './emergency-access.service';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Restricted records, and the break-glass access that opens them. */
@ApiTags('emergency-access')
@ApiBearerAuth('JWT-auth')
@Controller('emergency-access')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmergencyAccessController {
  constructor(private readonly service: EmergencyAccessService) {}

  @Post('patients/:patientId')
  @Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'lab_technician', 'facility_admin', 'super_admin')
  @ApiOperation({
    summary: "Open a restricted patient's record, with a reason",
    description: `Nobody is refused. The access lasts ${EMERGENCY_ACCESS_HOURS} hours, lapses on its own, and is put in front of an administrator afterwards.`,
  })
  open(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Body() body: { reason: string },
  ) {
    return this.service.grant(facilityOf(user), patientId, body?.reason, user);
  }

  @Get('patients/:patientId/status')
  @Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'lab_technician', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Whether this record is restricted, and whether you currently hold access' })
  async status(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    const facilityId = facilityOf(user);
    const restricted = await this.service.isRestricted(facilityId, patientId);
    const grant = restricted ? await this.service.activeGrant(facilityId, patientId, user.id) : null;
    return { restricted, grant, hours: EMERGENCY_ACCESS_HOURS };
  }

  @Get()
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Break-glass access to review, unreviewed first' })
  @ApiQuery({ name: 'unreviewed', required: false })
  list(@CurrentUser() user: CurrentUserType, @Query('unreviewed') unreviewed?: string) {
    return this.service.list(facilityOf(user), unreviewed === 'true');
  }

  @Patch(':id/review')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Record that an administrator has looked at this access' })
  review(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.service.review(facilityOf(user), id, body?.note ?? '', user);
  }

  @Patch(':id/close')
  @Roles('doctor', 'nurse', 'clinical_officer', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Give the access back before it lapses' })
  close(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.close(facilityOf(user), id);
  }

  @Patch('patients/:patientId/restrict')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Withhold a record from ordinary clinical access, or release it' })
  restrict(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Body() body: { restricted: boolean; reason?: string },
  ) {
    return this.service.setRestricted(facilityOf(user), patientId, !!body?.restricted, body?.reason);
  }
}
