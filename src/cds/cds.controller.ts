import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { CdsService } from './cds.service';
import { DATA_SOURCES_USED } from './cds';
import { SOURCES } from './data/sources';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Clinical decision support — advice drawn from the record, with its sources. */
@ApiTags('cds')
@ApiBearerAuth('JWT-auth')
@Controller('cds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'facility_admin', 'super_admin')
export class CdsController {
  constructor(private readonly service: CdsService) {}

  @Get('sources')
  @ApiOperation({
    summary: 'Which parts of the record the rules read, and the guidelines they cite',
  })
  sources() {
    return {
      dataSources: DATA_SOURCES_USED,
      guidelines: Object.values(SOURCES),
      note:
        'Every rule cites a published source and names the findings that made it fire. A rule that cannot be pointed at a guideline is not written.',
    };
  }

  @Get('patients/:patientId')
  @ApiOperation({
    summary: 'Advice for a patient, optionally about a drug about to be given',
  })
  @ApiQuery({ name: 'itemId', required: false, description: 'A stock item about to be prescribed or dispensed' })
  @ApiQuery({ name: 'drugName', required: false, description: 'A drug named in free text, where it is not in stock' })
  forPatient(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('itemId') itemId?: string,
    @Query('drugName') drugName?: string,
  ) {
    return this.service.forPatient(facilityOf(user), patientId, { itemId, drugName });
  }
}
