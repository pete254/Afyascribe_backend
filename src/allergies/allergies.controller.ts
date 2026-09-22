import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { AllergiesService } from './allergies.service';
import { CreateAllergyDto, UpdateAllergyDto } from './dto/allergy.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * The patient's allergy list, allergy history and medication list — the
 * "Medication Management & HPT Registry" capability. Every clinical role can
 * read them, because a prescriber who cannot see an allergy is the hazard.
 */
@ApiTags('allergies')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'pharmacist', 'clinical_officer', 'facility_admin', 'super_admin')
export class AllergiesController {
  constructor(private readonly service: AllergiesService) {}

  @Get('patients/:patientId/allergies')
  @ApiOperation({ summary: "A patient's allergy list (activeOnly=true) or full allergy history" })
  list(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.list(facilityOf(user), patientId, activeOnly === 'true');
  }

  @Post('allergies')
  @ApiOperation({ summary: 'Record an allergy or intolerance' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateAllergyDto) {
    return this.service.create(facilityOf(user), dto, user);
  }

  @Patch('allergies/:id')
  @ApiOperation({ summary: 'Update an allergy — resolving or refuting it keeps it in the history' })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateAllergyDto) {
    return this.service.update(facilityOf(user), id, dto, user);
  }

  @Get('patients/:patientId/allergies/check')
  @ApiOperation({ summary: 'Check a drug against the active allergy list before prescribing or dispensing' })
  check(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('itemId') itemId?: string,
    @Query('name') name?: string,
  ) {
    return this.service.checkDrug(facilityOf(user), patientId, { itemId, name });
  }

  @Get('patients/:patientId/medications')
  @ApiOperation({ summary: "A patient's medication list (activeOnly=true) or full medication history" })
  medications(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.medications(facilityOf(user), patientId, activeOnly === 'true');
  }
}
