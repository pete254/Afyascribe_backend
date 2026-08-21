import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { KardexService } from './kardex.service';
import {
  RecordAdministrationDto,
  RecordVitalDto,
  CreateCarePlanDto,
  UpdateCarePlanDto,
} from './dto/kardex.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * The nursing kardex — a patient's medication administration record (MAR). The
 * doctor's prescriptions supply the drug orders; nurses sign each dose in or out
 * here, round by round.
 */
@ApiTags('kardex')
@ApiBearerAuth('JWT-auth')
@Controller('kardex')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
export class KardexController {
  constructor(private readonly svc: KardexService) {}

  @Get('rounds')
  @ApiOperation({ summary: 'Admitted patients with a kardex to work through (ward round list)' })
  rounds(@CurrentUser() user: CurrentUserType) {
    return this.svc.activeAdmissionsWithKardex(facilityOf(user));
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: "A patient's full medication kardex" })
  patient(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.svc.patientKardex(facilityOf(user), patientId);
  }

  @Get('admission/:admissionId')
  @ApiOperation({ summary: 'Kardex for an inpatient admission (bedside view)' })
  admission(@CurrentUser() user: CurrentUserType, @Param('admissionId') admissionId: string) {
    return this.svc.admissionKardex(facilityOf(user), admissionId);
  }

  @Post()
  @ApiOperation({ summary: 'Sign a medication administration onto the kardex' })
  record(@CurrentUser() user: CurrentUserType, @Body() dto: RecordAdministrationDto) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return this.svc.record(facilityOf(user), dto, user.id, name);
  }

  @Post('vitals')
  @ApiOperation({ summary: 'Chart a set of bedside vitals' })
  recordVital(@CurrentUser() user: CurrentUserType, @Body() dto: RecordVitalDto) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return this.svc.recordVital(facilityOf(user), dto, user.id, name);
  }

  @Post('care-plan')
  @ApiOperation({ summary: 'Add a nursing care-plan entry' })
  createCarePlan(@CurrentUser() user: CurrentUserType, @Body() dto: CreateCarePlanDto) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return this.svc.createCarePlan(facilityOf(user), dto, user.id, name);
  }

  @Patch('care-plan/:id')
  @ApiOperation({ summary: 'Update a care-plan entry (evaluation / status)' })
  updateCarePlan(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: UpdateCarePlanDto,
  ) {
    return this.svc.updateCarePlan(facilityOf(user), id, dto);
  }
}
