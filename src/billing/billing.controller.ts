// src/billing/billing.controller.ts
// UPDATED: Added partial payment endpoint
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateBillingDto } from './dto/create-billing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CapabilityGuard } from '../auth/guards/capability.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireCapability } from '../auth/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CollectPaymentDto, WaiveBillingDto } from './dto/mark-paid.dto';

@ApiTags('billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Create a bill for a visit' })
  create(@Body() dto: CreateBillingDto, @CurrentUser() user: any) {
    return this.billingService.create(dto, user.facilityId);
  }

  @Post('reconcile-ledger')
  @Roles('facility_admin', 'super_admin', 'accountant')
  @ApiOperation({ summary: 'Post journals for bills/payments made before the chart existed' })
  reconcileLedger(@CurrentUser() user: any) {
    return this.billingService.reconcileLedger(user.facilityId);
  }

  @Get('visit/:visitId')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get all bills for a specific visit' })
  findByVisit(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @CurrentUser() user: any,
  ) {
    return this.billingService.findByVisit(visitId, user.facilityId);
  }

  @Get('unpaid-today')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: "Get today's unpaid bills for the facility" })
  findUnpaidToday(@CurrentUser() user: any) {
    return this.billingService.findUnpaidToday(user.facilityId);
  }

  @Get('patient/:patientId/ledger')
  @Roles('receptionist', 'cashier', 'accountant', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Patient statement: charges, payments, deposits, waivers with running balance' })
  patientLedger(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billingService.patientLedger(
      patientId,
      user.facilityId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('cashbook')
  @Roles('cashier', 'accountant', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Cashbook / till ledger: money collected by method and cashier, for reconciliation' })
  cashbook(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cashierId') cashierId?: string,
  ) {
    return this.billingService.cashbook(
      user.facilityId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      cashierId || undefined,
    );
  }

  @Get('outstanding')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Unpaid bills raised before today (uncollected from earlier days)' })
  findOutstanding(@CurrentUser() user: any) {
    return this.billingService.findOutstandingOlder(user.facilityId);
  }

  @Get('aging')
  @Roles('cashier', 'accountant', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Accounts-receivable aging (30/60/90) by payer' })
  aging(@CurrentUser() user: any, @Query('asOf') asOf?: string) {
    return this.billingService.agingReport(user.facilityId, asOf);
  }

  // ── Insurance claims ────────────────────────────────────────────────────────

  @Get('claims')
  @Roles('receptionist', 'cashier', 'accountant', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Insurance claims for the facility (filterable)' })
  findClaims(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('insurer') insurer?: string,
    @Query('scheme') scheme?: string,
    @Query('patientId') patientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billingService.findClaims(user.facilityId, {
      status,
      insurer,
      scheme,
      patientId,
      from,
      to,
    });
  }

  @Get('claims/summary')
  @Roles('receptionist', 'cashier', 'accountant', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Per-insurer claim performance (billed, paid, outstanding, avg days)' })
  claimsSummary(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billingService.claimsSummary(user.facilityId, { from, to });
  }

  @Patch(':id/claim')
  @Roles('receptionist', 'cashier', 'accountant', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Update a claim status / reference (submit, reject, reopen)' })
  updateClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { claimStatus?: string; claimRef?: string },
    @CurrentUser() user: any,
  ) {
    return this.billingService.updateClaim(id, body, user.facilityId);
  }

  @Get('visit/:visitId/summary')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get billing summary (totals) for a visit' })
  getSummary(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @CurrentUser() user: any,
  ) {
    return this.billingService.getVisitBillingSummary(visitId, user.facilityId);
  }

  @Patch(':id')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Update an unpaid bill (amount or description)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { amount?: number; serviceDescription?: string },
    @CurrentUser() user: any,
  ) {
    return this.billingService.updateBill(id, dto, user.facilityId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Delete an unpaid bill' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.billingService.deleteBill(id, user.facilityId);
  }

  // ── PARTIAL / FULL PAYMENT ─────────────────────────────────────────────────
  @Patch(':id/collect')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @RequireCapability('collect_payment')
  @ApiOperation({ summary: 'Collect partial or full payment — supports multiple payment methods' })
  collectPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { paymentMethod: string; amountReceived: number; mpesaReference?: string },
    @CurrentUser() user: any,
  ) {
    return this.billingService.collectPayment(
      id,
      { ...dto, collectedById: user.id },
      user.facilityId,
    );
  }

  // ── LEGACY ─────────────────────────────────────────────────────────────────
  @Patch(':id/pay')
  @Roles('receptionist', 'cashier', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @RequireCapability('collect_payment')
  @ApiOperation({ summary: 'Mark bill as paid (legacy — use /collect for partial payments)' })
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.billingService.markPaid(id, dto, user.id, user.facilityId);
  }

  @Patch(':id/waive')
  @Roles('facility_admin', 'super_admin')
  @RequireCapability('waive_bill')
  @ApiOperation({ summary: 'Waive a bill (admin only)' })
  waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveBillingDto,
    @CurrentUser() user: any,
  ) {
    return this.billingService.waive(id, dto.waiverReason, user.id, user.facilityId);
  }
}