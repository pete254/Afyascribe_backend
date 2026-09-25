import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { LabourService } from './labour.service';
import { BirthDto, LabourObservationDto, OpenDeliveryDto, UpdateDeliveryDto } from './dto/labour.dto';
import {
  LCG_ABBREVIATIONS,
  LCG_CERVIX_LAG_HOURS,
  LCG_ROWS,
  LCG_SECTION_LABEL,
  LCG_SOURCE,
  PARTOGRAPH_LEGACY,
} from './data/labour-care-guide';
import {
  BIRTH_OUTCOME_LABEL,
  DISCHARGE_STATUS_LABEL,
  LABOUR_ONSETS,
  LabourTool,
  PERINEUM_LABEL,
} from './maternity.enums';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Labour and delivery — the WHO Labour Care Guide and the MOH 333 register. */
@ApiTags('maternity')
@ApiBearerAuth('JWT-auth')
@Controller('maternity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'facility_admin', 'super_admin')
export class LabourController {
  constructor(private readonly service: LabourService) {}

  @Get('labour/reference')
  @ApiOperation({ summary: "The Labour Care Guide's rows and alert criteria, with its source" })
  reference() {
    return {
      source: LCG_SOURCE,
      rows: LCG_ROWS,
      sections: LCG_SECTION_LABEL,
      abbreviations: LCG_ABBREVIATIONS,
      cervixLagHours: LCG_CERVIX_LAG_HOURS,
      partograph: PARTOGRAPH_LEGACY,
      labourOnsets: LABOUR_ONSETS,
      birthOutcomes: BIRTH_OUTCOME_LABEL,
      dischargeStatuses: DISCHARGE_STATUS_LABEL,
      perineum: PERINEUM_LABEL,
    };
  }

  @Get('pregnancies/:pregnancyId/delivery')
  @ApiOperation({ summary: "A pregnancy's labour record, if one has been opened" })
  forPregnancy(@CurrentUser() user: CurrentUserType, @Param('pregnancyId') pregnancyId: string) {
    return this.service.forPregnancy(facilityOf(user), pregnancyId);
  }

  @Post('deliveries')
  @ApiOperation({ summary: 'Open the labour record for a pregnancy' })
  open(@CurrentUser() user: CurrentUserType, @Body() dto: OpenDeliveryDto) {
    return this.service.open(facilityOf(user), dto, user);
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'The labour chart: observations, alerts and babies' })
  @ApiQuery({ name: 'tool', required: false, enum: ['labour-care-guide', 'partograph'] })
  chart(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Query('tool') tool?: LabourTool,
  ) {
    return this.service.chart(facilityOf(user), id, tool ?? 'labour-care-guide');
  }

  @Patch('deliveries/:id')
  @ApiOperation({ summary: 'Record or amend the delivery itself' })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateDeliveryDto) {
    return this.service.update(facilityOf(user), id, dto);
  }

  @Post('deliveries/:id/observations')
  @ApiOperation({ summary: 'Record a column of the labour chart' })
  observe(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: LabourObservationDto,
  ) {
    return this.service.observe(facilityOf(user), id, dto, user);
  }

  @Delete('labour-observations/:id')
  @ApiOperation({ summary: 'Remove an observation recorded in error' })
  removeObservation(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.removeObservation(facilityOf(user), id);
  }

  @Post('deliveries/:id/births')
  @ApiOperation({ summary: 'Record a baby; the pregnancy closes on its outcome' })
  recordBirth(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: BirthDto) {
    return this.service.recordBirth(facilityOf(user), id, dto);
  }

  @Patch('births/:id')
  @ApiOperation({ summary: 'Amend a baby’s record' })
  updateBirth(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: BirthDto) {
    return this.service.updateBirth(facilityOf(user), id, dto);
  }

  @Delete('births/:id')
  @ApiOperation({ summary: 'Remove a baby recorded in error' })
  removeBirth(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.removeBirth(facilityOf(user), id);
  }
}
