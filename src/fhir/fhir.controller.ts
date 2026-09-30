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
    return { base: this.hie.base, configured: this.hie.configured, authMode: this.hie.authMode };
  }

  @Get('shr/open-visits')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: 'Visits already open at the HIE with valid consent',
    description:
      'Check this before asking for consent. A visit that comes back already holds an open consent — carry on with it and refresh its token rather than putting the patient through another OTP.',
  })
  openVisits(@Query('patientId') patientId: string, @Query('facilityId') facilityId: string) {
    if (!patientId?.trim() || !facilityId?.trim()) {
      throw new BadRequestException(
        "Both the patient's Client Registry id and the facility's Facility Registry code are required.",
      );
    }
    return this.hie.openVisits(patientId.trim(), facilityId.trim());
  }

  @Post('shr/consents')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: "Ask the patient for consent; an OTP goes to them" })
  requestConsent(@Body() body: unknown) {
    return this.hie.requestConsent(body);
  }

  @Post('shr/consents/:consentId/status')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Where a consent request has got to' })
  consentStatus(@Param('consentId') consentId: string) {
    return this.hie.consentStatus(consentId);
  }

  @Post('shr/consents/:consentId/resend-otp')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: 'Send the code again',
    description: 'Returns a new otp_record. Verify against that one, not the record from the original request.',
  })
  resendOtp(@Param('consentId') consentId: string) {
    return this.hie.resendOtp(consentId);
  }

  @Post('shr/consents/:consentId/verify')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: "Record the patient's decision",
    description:
      'Approving returns the consent token and visit id. A refusal goes through this same call with decision Reject and a reason — abandoning the request instead records no refusal and leaves it Pending.',
  })
  verifyConsent(
    @Param('consentId') consentId: string,
    @Body()
    body: { otpRecord?: string; otp?: string; decision?: 'Approve' | 'Reject'; rejectionReason?: string },
  ) {
    if (!body?.otpRecord?.trim()) {
      throw new BadRequestException(
        'The otp_record from the consent request (or from a resend) is required.',
      );
    }
    if (body.decision === 'Reject' && !body.rejectionReason?.trim()) {
      throw new BadRequestException('A refusal needs a reason, so that the record shows why.');
    }
    return this.hie.verifyConsent(consentId, {
      otpRecord: body.otpRecord.trim(),
      otp: body.otp?.trim(),
      decision: body.decision,
      rejectionReason: body.rejectionReason?.trim(),
    });
  }

  @Post('shr/visits/:visitId/refresh')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'A fresh consent token for a visit that is still open' })
  refreshVisit(@Param('visitId') visitId: string) {
    return this.hie.refreshVisit(visitId);
  }

  @Post('shr/visits/:visitId/close')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({
    summary: 'Close the visit at the end of the encounter',
    description:
      'Usually dispatches a closure OTP and returns an otp_record; the visit stays open until that is verified. An end_date coming back instead means it is already closed. Leaving visits open keeps a consent live for longer than the encounter justifies.',
  })
  closeVisit(
    @Param('visitId') visitId: string,
    @Body() body: { patientIncapable?: boolean; incapacityReason?: string } = {},
  ) {
    if (body?.patientIncapable && !body.incapacityReason?.trim()) {
      throw new BadRequestException('Closing without the patient needs a reason recorded.');
    }
    return this.hie.closeVisit(visitId, {
      patientIncapable: body?.patientIncapable,
      incapacityReason: body?.incapacityReason?.trim(),
    });
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
    summary: "Read a patient's record from the national Shared Health Record",
    description:
      "The consent token is the patient's permission to look. It is taken as a header rather than a query parameter so that it stays out of URLs, browser history and this system's own audit ledger, which records the path of every request. Every read is attributed to a practitioner: crId is the patient's Client Registry id, and practitionerId identifies the clinician from the Health Worker Registry.",
  })
  async patientRecords(
    @CurrentUser() user: CurrentUserType,
    @Headers('x-consent-token') consentToken: string,
    @Query('crId') crId?: string,
    @Query('practitionerId') practitionerId?: string,
    @Query('resources') resources?: string,
    @Query('pageToken') pageToken?: string,
  ) {
    if (!consentToken?.trim()) {
      throw new BadRequestException(
        "A consent token is required. Verify the patient's consent first, and send the token it returns in the X-Consent-Token header.",
      );
    }
    if (!crId?.trim()) {
      throw new BadRequestException(
        "The patient's Client Registry id is required. Resolve it through Patient Search if you do not hold it — consent is against a CR id, not a national ID.",
      );
    }
    // The registry identifier of whoever is looking. Defaults to the logged-in
    // clinician's registration number; overridable because the Health Worker
    // Registry id is not necessarily the same as the regulator's number.
    const practitioner = practitionerId?.trim() || user.practitionerNo?.trim();
    if (!practitioner) {
      throw new BadRequestException(
        'Every read is attributed to a practitioner, and this account has no registration number recorded. Add one, or pass practitionerId.',
      );
    }
    if (!this.hie.configured) {
      throw new BadRequestException('No HIE credentials are configured, so the national record cannot be read.');
    }

    const result = await this.hie.patientRecords(consentToken.trim(), {
      crId: crId.trim(),
      practitionerId: practitioner,
      resources: resources?.trim(),
      pageToken: pageToken?.trim(),
    });
    return { readFrom: `${this.hie.base}/shr/patient-records`, status: result.status, records: result.body };
  }
}
