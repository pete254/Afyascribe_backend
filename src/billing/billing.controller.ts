// src/billing/billing.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateBillingDto } from './dto/create-billing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CollectPaymentDto, WaiveBillingDto } from './dto/mark-paid.dto';

@ApiTags('billing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ── CREATE BILL ────────────────────────────────────────────────────────────
  @Post()
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Create a bill for a visit' })
  create(@Body() dto: CreateBillingDto, @CurrentUser() user: any) {
    return this.billingService.create(dto, user.facilityId);
  }

  // ── GET BILLS FOR A VISIT ──────────────────────────────────────────────────
  @Get('visit/:visitId')
  @Roles('receptionist', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get all bills for a specific visit' })
  findByVisit(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @CurrentUser() user: any,
  ) {
    return this.billingService.findByVisit(visitId, user.facilityId);
  }

  // ── GET UNPAID BILLS TODAY ─────────────────────────────────────────────────
  @Get('unpaid-today')
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: "Get today's unpaid bills for the facility" })
  findUnpaidToday(@CurrentUser() user: any) {
    return this.billingService.findUnpaidToday(user.facilityId);
  }

  // ── GET SUMMARY FOR VISIT ──────────────────────────────────────────────────
  @Get('visit/:visitId/summary')
  @Roles('receptionist', 'facility_admin', 'super_admin', 'doctor', 'nurse')
  @ApiOperation({ summary: 'Get billing summary (totals) for a visit' })
  getSummary(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @CurrentUser() user: any,
  ) {
    return this.billingService.getVisitBillingSummary(visitId, user.facilityId);
  }

  // ── COLLECT PAYMENT ────────────────────────────────────────────────────────
  @Patch(':id/pay')
  @Roles('receptionist', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Collect payment for a bill — advances visit when all cash bills cleared' })
  markPaid(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: CollectPaymentDto,
  @CurrentUser() user: any,
  ) {
  return this.billingService.markPaid(id, dto, user.userId, user.facilityId);
  }

  // ── WAIVE BILL ─────────────────────────────────────────────────────────────
  @Patch(':id/waive')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Waive a bill (admin only)' })
  waive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveBillingDto,
    @CurrentUser() user: any,
  ) {
    return this.billingService.waive(id, dto.waiverReason, user.userId, user.facilityId);
  }
}