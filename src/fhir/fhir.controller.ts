import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { FhirService } from './fhir.service';
import { HieFhirClient } from './hie-fhir.client';

@ApiTags('fhir')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('fhir')
export class FhirController {
  constructor(
    private readonly fhir: FhirService,
    private readonly hie: HieFhirClient,
  ) {}

  @Get('Patient/:id')
  @ApiOperation({
    summary: "A patient's coded record as a FHIR R4 Bundle (SHR/HIE export)",
    description: 'mode=collection (default, readable) or mode=transaction (submission-ready).',
  })
  patientBundle(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Query('mode') mode?: string,
  ) {
    return this.fhir.patientBundle(id, user.facilityId, mode === 'transaction' ? 'transaction' : 'collection');
  }

  @Post('Patient/:id/$submit')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "Submit a patient's record to the national HIE (FHIR transaction)",
    description:
      'Builds the transaction Bundle and POSTs it to HIE_FHIR_BASE. Requires HIE credentials (HIE_AUTH_TOKEN) to be configured.',
  })
  async submit(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    const bundle = await this.fhir.patientBundle(id, user.facilityId, 'transaction');
    const result = await this.hie.submit(bundle);
    return { submittedTo: this.hie.base, status: result.status, response: result.body };
  }
}
