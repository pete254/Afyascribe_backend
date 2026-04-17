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