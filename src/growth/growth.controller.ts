import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { GrowthService } from './growth.service';
import { GrowthIndicator, Sex } from './data/who-standards';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Growth monitoring against the WHO Child Growth Standards (0–5 years). */
@ApiTags('growth')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'nutritionist', 'facility_admin', 'super_admin')
export class GrowthController {
  constructor(private readonly service: GrowthService) {}

  @Get('patients/:patientId/growth')
  @ApiOperation({
    summary: "A child's growth over time with WHO z-scores, from the weights and heights recorded at triage",
  })
  series(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.service.series(facilityOf(user), patientId);
  }

  @Get('growth/reference')
  @ApiOperation({ summary: 'WHO reference curves for an indicator, for plotting against' })
  reference(@Query('indicator') indicator: string, @Query('sex') sex: string) {
    const ind = indicator as GrowthIndicator;
    const s = sex as Sex;
    if (!['wfa', 'hfa', 'wfl', 'wfh'].includes(ind) || !['M', 'F'].includes(s)) {
      throw new BadRequestException('indicator must be wfa|hfa|wfl|wfh and sex M|F');
    }
    return this.service.referenceCurves(ind, s);
  }
}
