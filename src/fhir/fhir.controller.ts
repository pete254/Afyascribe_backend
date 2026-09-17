import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { FhirService } from './fhir.service';

@ApiTags('fhir')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('fhir')
export class FhirController {
  constructor(private readonly fhir: FhirService) {}

  @Get('Patient/:id')
  @ApiOperation({
    summary: "A patient's coded record as a FHIR R4 Bundle (SHR/HIE export)",
  })
  patientBundle(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.fhir.patientBundle(id, user.facilityId);
  }
}
