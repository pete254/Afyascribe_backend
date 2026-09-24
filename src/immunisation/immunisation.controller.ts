import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { ImmunisationService } from './immunisation.service';
import { RecordDoseDto } from './dto/immunisation.dto';
import { SCHEDULE_SOURCE, childhoodSchedule, vaccineLabel } from './data/schedule';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Immunisation against Kenya's national schedule. */
@ApiTags('immunisation')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'facility_admin', 'super_admin')
export class ImmunisationController {
  constructor(private readonly service: ImmunisationService) {}

  @Get('immunisation/schedule')
  @ApiOperation({ summary: "Kenya's national childhood schedule, with WHO's provenance" })
  schedule() {
    return {
      source: SCHEDULE_SOURCE,
      doses: childhoodSchedule().map((r) => ({
        vaccine: r.vaccine,
        vaccineLabel: vaccineLabel(r.vaccine),
        dose: r.dose,
        age: r.age,
        target: r.target,
      })),
    };
  }

  @Get('immunisation/maternal')
  @ApiOperation({ summary: 'The maternal schedule (Td in pregnancy)' })
  maternal() {
    return this.service.maternal();
  }

  @Get('patients/:patientId/immunisation')
  @ApiOperation({ summary: "A child's immunisation card — given, due and overdue" })
  card(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.service.card(facilityOf(user), patientId);
  }

  @Post('immunisation')
  @ApiOperation({ summary: 'Record a dose given (here, or brought in on a card)' })
  record(@CurrentUser() user: CurrentUserType, @Body() dto: RecordDoseDto) {
    return this.service.record(facilityOf(user), dto, user);
  }

  @Delete('immunisation/:id')
  @ApiOperation({ summary: 'Remove a dose recorded in error' })
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.remove(facilityOf(user), id);
  }
}
