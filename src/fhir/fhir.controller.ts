import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
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

  @Get('Composition/:patientId')
  @ApiOperation({
    summary: "A patient's clinical summary — an IPS-style FHIR document, human-readable and exchangeable",
  })
  clinicalSummary(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.fhir.clinicalSummary(patientId, user.facilityId);
  }

  @Get('Claim/:visitId')
  @ApiOperation({
    summary: "A visit's charges as a FHIR R4 Claim bundle (SHA eClaims)",
    description: 'Claim + referenced Patient, Coverage and Organization, coded for SHA.',
  })
  visitClaim(@Param('visitId') visitId: string, @CurrentUser() user: CurrentUserType) {
    return this.fhir.visitClaimBundle(visitId, user.facilityId);
  }

  @Get('visits/:visitId/$shr-bundle')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "A visit's record shaped for the Shared Health Record, with the conformance check",
    description:
      'Builds the collection Bundle and runs it against the SHR\'s stated rules without sending it, so the shape can be inspected before any credentials exist.',
  })
  async shrBundle(@Param('visitId') visitId: string, @CurrentUser() user: CurrentUserType) {
    return this.fhir.visitShrBundle(visitId, user.facilityId);
  }

  @Post('visits/:visitId/$submit')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "Submit a visit's record to the national Shared Health Record",
    description:
      'POSTs a collection Bundle to /shr/bundles. Requires HIE credentials, and the consent token returned when the visit was opened.',
  })
  async submitVisit(
    @Param('visitId') visitId: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: { consentToken?: string; hieVisitId?: string } = {},
  ) {
    const { bundle, validation } = await this.fhir.visitShrBundle(visitId, user.facilityId, {
      hieVisitId: body.hieVisitId ?? null,
    });

    // A bundle that breaks the SHR's own rules is not worth sending: it would
    // be rejected, and the reason would come back less clearly than this.
    if (!validation.ok) {
      throw new BadRequestException({
        message: 'The bundle does not satisfy the Shared Health Record\'s rules',
        problems: validation.problems,
      });
    }
    if (!this.hie.configured) {
      throw new BadRequestException(
        'No HIE credentials are configured. The bundle is ready — fetch it with $shr-bundle to inspect it.',
      );
    }

    const result = await this.hie.submitBundle(bundle, body.consentToken);
    return { submittedTo: `${this.hie.base}/shr/bundles`, status: result.status, response: result.body };
  }

  @Get('shr/status')
  @ApiOperation({
    summary: 'Whether this facility can talk to the Shared Health Record yet',
    description:
      'Reports the endpoint and whether credentials are present. It does not call the HIE, so it answers even when nothing is configured — which is what lets a screen say so plainly instead of failing.',
  })
  shrStatus() {
    return { base: this.hie.base, configured: this.hie.configured };
  }

  @Get('shr/open-visits')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Visits already open at the HIE with valid consent' })
  openVisits() {
    return this.hie.openVisits();
  }

  @Post('shr/consents')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: "Ask the patient for consent; an OTP goes to them" })
  requestConsent(@Body() body: unknown) {
    return this.hie.requestConsent(body);
  }

  @Post('shr/consents/:consentId/verify')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Verify the OTP; returns the consent token and the visit id' })
  verifyConsent(@Param('consentId') consentId: string, @Body() body: { otp: string }) {
    return this.hie.verifyConsent(consentId, body?.otp);
  }

  @Get('shr/patient-records')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse', 'clinical_officer')
  @ApiHeader({
    name: 'X-Consent-Token',
    required: true,
    description: 'The token returned when the visit was opened against a verified consent.',
  })
  @ApiOperation({
    summary: "Read a patient's record back from the national Shared Health Record",
    description:
      "The receiving half of the exchange. The consent token is the patient's permission to look, and it is taken as a header rather than a query parameter so that it stays out of URLs, browser history and this system's own audit ledger, which records the path of every request.",
  })
  async patientRecords(
    @Headers('x-consent-token') consentToken: string,
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
  ) {
    if (!consentToken?.trim()) {
      throw new BadRequestException(
        'A consent token is required. Verify the patient\'s consent first, and send the token it returns in the X-Consent-Token header.',
      );
    }
    if (!this.hie.configured) {
      throw new BadRequestException(
        'No HIE credentials are configured, so the national record cannot be read.',
      );
    }

    const params: Record<string, string> = {};
    if (patientId?.trim()) params.patientId = patientId.trim();
    if (visitId?.trim()) params.visitId = visitId.trim();

    const result = await this.hie.patientRecords(consentToken.trim(), params);
    return {
      readFrom: `${this.hie.base}/shr/patient-records`,
      status: result.status,
      records: result.body,
    };
  }
}
