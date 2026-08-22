import { Controller, Get, Query, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Guard helper — user is allowed to view reports if they are:
 * - facility_admin or super_admin (always)
 * - A doctor with isOwner === true
 */
function assertCanViewReports(user: any): void {
  const isAdmin = user.role === 'facility_admin' || user.role === 'super_admin';
  const isOwner = user.role === 'doctor' && (user as any).isOwner === true;
  if (!isAdmin && !isOwner) {
    throw new ForbiddenException('Only admins and clinic owners can view reports');
  }
}

@ApiTags('reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ── PATIENTS TODAY ─────────────────────────────────────────────────────────
  @Get('patients-today')
  @Roles('facility_admin', 'super_admin', 'receptionist', 'doctor')
  @ApiOperation({ summary: 'All patients at the facility today with visit status' })
  getPatientsToday(@CurrentUser() user: any) {
    assertCanViewReports(user);
    return this.reportsService.getPatientsToday(user.facilityId);
  }

  // ── FINANCIAL REPORT ───────────────────────────────────────────────────────
  @Get('financials')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Financial summary for a date range' })
  @ApiQuery({ name: 'from', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2025-01-31' })
  getFinancials(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(today.setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.getFinancialReport(user.facilityId, fromDate, toDate);
  }

  // ── PAYER MIX ──────────────────────────────────────────────────────────────
  @Get('payer-mix')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Revenue split by payer (self-pay vs each insurer) for a date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getPayerMix(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : today;
    return this.reportsService.payerMix(user.facilityId, fromDate, toDate);
  }

  // ── MOH 204A / 204B OUTPATIENT REGISTER ────────────────────────────────────
  @Get('outpatient-register')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'MOH 204A/204B outpatient register (under-5 / over-5) for a date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getOutpatientRegister(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : today;
    return this.reportsService.outpatientRegister(user.facilityId, fromDate, toDate);
  }

  // ── MOH 705A / 705B OUTPATIENT MORBIDITY SUMMARY ───────────────────────────
  @Get('outpatient-morbidity')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'MOH 705A/705B outpatient morbidity summary (under-5 / over-5)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getOutpatientMorbidity(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : today;
    return this.reportsService.outpatientMorbidity(user.facilityId, fromDate, toDate);
  }

  // ── MOH 706 LABORATORY MONTHLY SUMMARY ─────────────────────────────────────
  @Get('lab-summary')
  @Roles('facility_admin', 'super_admin', 'doctor', 'lab_technician')
  @ApiOperation({ summary: 'MOH 706 laboratory monthly summary — tests by department' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getLabSummary(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.labSummary(user.facilityId, fromDate, toDate);
  }

  // ── MOH 328 DAILY BED RETURN ───────────────────────────────────────────────
  @Get('bed-return')
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'MOH 328 bed return — admissions/discharges/occupancy by ward' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getBedReturn(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.bedReturn(user.facilityId, fromDate, toDate);
  }

  // ── MOH 717 MONTHLY WORKLOAD ───────────────────────────────────────────────
  @Get('workload')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'MOH 717 monthly service workload summary' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getWorkload(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.workload(user.facilityId, fromDate, toDate);
  }

  // ── CASHIER / COLLECTIONS ──────────────────────────────────────────────────
  @Get('collections')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Money collected in a period, grouped by cashier and tender' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getCollections(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.collections(user.facilityId, fromDate, toDate);
  }

  // ── PATIENT CREDITS ────────────────────────────────────────────────────────
  @Get('patient-credits')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Patients holding prepaid deposit credit' })
  getPatientCredits(@CurrentUser() user: any) {
    assertCanViewReports(user);
    return this.reportsService.patientCredits(user.facilityId);
  }

  // ── REVERSED / WRITTEN-OFF INVOICES ────────────────────────────────────────
  @Get('reversed-invoices')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Bills waived / written off in a period' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getReversedInvoices(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.reversedInvoices(user.facilityId, fromDate, toDate);
  }

  // ── REVENUE SHARING (BY DOCTOR) ────────────────────────────────────────────
  @Get('revenue-by-doctor')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Revenue attributed to each attending doctor in a period' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getRevenueByDoctor(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.revenueByDoctor(user.facilityId, fromDate, toDate);
  }

  // ── OUT-PATIENT TAT ────────────────────────────────────────────────────────
  @Get('outpatient-tat')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Out-patient turnaround time (check-in → triage → completion)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getOutpatientTat(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.outpatientTat(user.facilityId, fromDate, toDate);
  }

  // ── DIAGNOSIS BY COUNTY ────────────────────────────────────────────────────
  @Get('diagnosis-by-county')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Diagnoses grouped by patient county' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getDiagnosisByCounty(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.diagnosisByCounty(user.facilityId, fromDate, toDate);
  }

  // ── SERVICES STATISTICS ────────────────────────────────────────────────────
  @Get('services-statistics')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Volume and revenue of billed services by type and service' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getServicesStatistics(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.servicesStatistics(user.facilityId, fromDate, toDate);
  }

  // ── CONSULTATIONS ──────────────────────────────────────────────────────────
  @Get('consultations')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Consultations in a period, tallied by clinician' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getConsultations(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    assertCanViewReports(user);
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.consultationsReport(user.facilityId, fromDate, toDate);
  }

  // ── INSURANCE CLAIMS ───────────────────────────────────────────────────────
  @Get('insurance-claims')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Insurance claims report, filterable by scheme and date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'scheme', required: false, description: 'Filter by insurance scheme name' })
  getInsuranceClaims(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scheme') scheme?: string,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1)); // start of month
    const toDate = to ? new Date(to) : today;
    return this.reportsService.getInsuranceClaims(user.facilityId, fromDate, toDate, scheme);
  }

  // ── INSURANCE CLAIMS CSV EXPORT ────────────────────────────────────────────
  @Get('insurance-claims/export')
  @Roles('facility_admin', 'super_admin', 'doctor')
  @ApiOperation({ summary: 'Download insurance claims as CSV' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'scheme', required: false })
  async exportInsuranceClaimsCsv(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scheme') scheme?: string,
    @Res() res?: Response,
  ) {
    assertCanViewReports(user);
    const today = new Date();
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : today;

    const csv = await this.reportsService.getInsuranceClaimsCsv(
      user.facilityId, fromDate, toDate, scheme,
    );

    const filename = `insurance-claims-${fromDate.toISOString().slice(0, 10)}-to-${toDate.toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}