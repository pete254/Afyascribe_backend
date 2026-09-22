import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { ProblemsService } from './problems.service';
import { CreateProblemDto, UpdateProblemDto } from './dto/problem.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** The patient problem list — record, update and read back a patient's conditions. */
@ApiTags('problems')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'facility_admin', 'super_admin')
export class ProblemsController {
  constructor(private readonly service: ProblemsService) {}

  @Get('patients/:patientId/problems')
  @ApiOperation({ summary: "A patient's active problem list (activeOnly=true) or full problem history" })
  list(
    @CurrentUser() user: CurrentUserType,
    @Param('patientId') patientId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.list(facilityOf(user), patientId, activeOnly === 'true');
  }

  @Post('problems')
  @ApiOperation({ summary: 'Add a condition to the problem list (ICD-11 coded via KNHTS)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateProblemDto) {
    return this.service.create(facilityOf(user), dto, user);
  }

  @Patch('problems/:id')
  @ApiOperation({ summary: 'Update a problem — resolving one keeps it in the history with the date' })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.service.update(facilityOf(user), id, dto, user);
  }
}
