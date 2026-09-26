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
import { WeeklyReturnService } from './weekly.service';
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
  constructor(
    private readonly service: SurveillanceService,
    private readonly weekly: WeeklyReturnService,
  ) {}

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

  // ── MOH 505, the weekly return ──────────────────────────────────────────

  @Get('weekly')
  @ApiOperation({
    summary: "A week's MOH 505, computed from the record",
    description:
      'Defaults to the week that has just ended, which is the one the form reports on. Figures are worked out from notified cases and the maternity and newborn registers.',
  })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'week', required: false })
  weeklyReturn(
    @CurrentUser() user: CurrentUserType,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.weekly.forWeek(facilityOf(user), year ? Number(year) : undefined, week ? Number(week) : undefined);
  }

  @Post('weekly')
  @ApiOperation({ summary: 'Save the week as a draft, keeping any figure corrected by hand' })
  saveWeekly(@CurrentUser() user: CurrentUserType, @Body() body: Record<string, any>) {
    return this.weekly.saveDraft(facilityOf(user), body, user);
  }

  @Post('weekly/submit')
  @ApiOperation({ summary: 'Submit the week to the sub-county' })
  submitWeekly(
    @CurrentUser() user: CurrentUserType,
    @Body() body: { year?: number; week?: number },
  ) {
    return this.weekly.submit(facilityOf(user), body?.year, body?.week, user);
  }

  @Get('weekly/history')
  @ApiOperation({ summary: 'Recent returns, and whether each one got out' })
  weeklyHistory(@CurrentUser() user: CurrentUserType, @Query('limit') limit?: string) {
    return this.weekly.history(facilityOf(user), limit ? Number(limit) : undefined);
  }

  @Get('weekly/missing')
  @ApiOperation({ summary: 'Weeks with no return at all' })
  weeklyMissing(@CurrentUser() user: CurrentUserType, @Query('weeks') weeks?: string) {
    return this.weekly.missing(facilityOf(user), weeks ? Number(weeks) : undefined);
  }

  @Get('weekly/:year/:week/export')
  @ApiOperation({ summary: 'One week as MOH 505' })
  exportWeekly(
    @CurrentUser() user: CurrentUserType,
    @Param('year') year: string,
    @Param('week') week: string,
  ) {
    return this.weekly.exportWeek(facilityOf(user), Number(year), Number(week));
  }
}