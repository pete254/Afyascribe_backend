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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { SurveillanceService } from './surveillance.service';
import { DismissNotificationDto, NotifyDto, RecordNotificationDto } from './dto/surveillance.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Disease surveillance — Kenya's IDSR priority conditions. */
@ApiTags('surveillance')
@ApiBearerAuth('JWT-auth')
@Controller('surveillance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'lab_technician', 'facility_admin', 'super_admin')
export class SurveillanceController {
  constructor(private readonly service: SurveillanceService) {}

  @Get('conditions')
  @ApiOperation({ summary: "The Ministry's IDSR conditions and case definitions, with their source" })
  conditions() {
    return this.service.reference();
  }

  @Get('patients/:patientId/suggestions')
  @ApiOperation({
    summary: "Notifiable conditions suggested by a patient's record",
    description:
      'Reads the diagnoses and the problem list. Writes nothing — looking at a record should not create a notification in it.',
  })
  @ApiQuery({ name: 'visitId', required: false })
  @ApiQuery({ name: 'text', required: false, description: 'A note still being written' })
  suggestions(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('visitId') visitId?: string,
    @Query('text') text?: string,
  ) {
    return this.service.suggestionsFor(facilityOf(user), patientId, { visitId, text });
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Conditions recorded at this facility' })
  list(
    @CurrentUser() user: CurrentUserType,
    @Query('status') status?: string,
    @Query('conditionCode') conditionCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(facilityOf(user), { status, conditionCode, from, to });
  }

  @Post('notifications')
  @ApiOperation({ summary: 'Open a record for a condition seen in a patient' })
  record(@CurrentUser() user: CurrentUserType, @Body() dto: RecordNotificationDto) {
    return this.service.record(facilityOf(user), dto);
  }

  @Patch('notifications/:id/dismiss')
  @ApiOperation({ summary: 'Record that nobody needs telling, and why' })
  dismiss(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: DismissNotificationDto,
  ) {
    return this.service.dismiss(facilityOf(user), id, dto.reason, user);
  }

  @Get('outstanding')
  @ApiOperation({
    summary: 'Cases not yet notified, most overdue first',
    description: "The Ministry's window for an immediate condition is 24 hours from suspicion.",
  })
  outstanding(@CurrentUser() user: CurrentUserType) {
    return this.service.outstanding(facilityOf(user));
  }

  @Patch('notifications/:id/notify')
  @ApiOperation({
    summary: 'Complete MOH 502 and tell the sub-county',
    description:
      'Attempts the alert as part of notifying and reports whether it got out, because if it did not the case still has to be phoned through.',
  })
  notify(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: NotifyDto,
  ) {
    return this.service.notify(facilityOf(user), id, dto, user);
  }

  @Get('notifications/:id/moh502')
  @ApiOperation({ summary: 'One case as MOH 502, for printing or sending on' })
  exportCase(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.exportCase(facilityOf(user), id);
  }
}