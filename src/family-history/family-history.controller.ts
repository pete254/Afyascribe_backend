import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { FamilyHistoryService } from './family-history.service';
import { CreateFamilyHistoryDto, UpdateFamilyHistoryDto } from './dto/family-history.dto';
import { FAMILY_RELATIONSHIPS, FAMILY_RELATIONSHIP_SYSTEM } from './family-history.enums';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** A patient's family health history — who in the family had what. */
@ApiTags('family-history')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'facility_admin', 'super_admin')
export class FamilyHistoryController {
  constructor(private readonly service: FamilyHistoryService) {}

  @Get('family-history/relationships')
  @ApiOperation({
    summary: 'Relationship codes (HL7 v3 RoleCode — KNHTS publishes no family relationship value set)',
  })
  relationships() {
    return { system: FAMILY_RELATIONSHIP_SYSTEM, relationships: FAMILY_RELATIONSHIPS };
  }

  @Get('patients/:patientId/family-history')
  @ApiOperation({ summary: "A patient's family history, closest relatives first" })
  list(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.service.list(facilityOf(user), patientId);
  }

  @Post('family-history')
  @ApiOperation({ summary: "Record a relative's health history" })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateFamilyHistoryDto) {
    return this.service.create(facilityOf(user), dto, user);
  }

  @Patch('family-history/:id')
  @ApiOperation({ summary: "Update a relative's history" })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateFamilyHistoryDto) {
    return this.service.update(facilityOf(user), id, dto);
  }
}
