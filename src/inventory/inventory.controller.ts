import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { ProcurementService } from './procurement.service';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseRequisitionService } from './purchase-requisition.service';
import { QuotationService } from './quotation.service';
import { SupplierInvoiceService } from './supplier-invoice.service';
import {
  CreateItemDto,
  UpdateItemDto,
  AdjustStockDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateGoodsReceiptDto,
  CreateSupplierPaymentDto,
  StockCountDto,
} from './dto/inventory.dto';
import { CreatePurchaseOrderDto, DecisionDto } from './dto/purchase-order.dto';
import { CreateRequisitionDto } from './dto/purchase-requisition.dto';
import { CreateQuotationDto } from './dto/quotation.dto';
import { CreateSupplierInvoiceDto } from './dto/supplier-invoice.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Stock Management — items, valuation ledger, adjustments. */
@ApiTags('inventory')
@ApiBearerAuth('JWT-auth')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'storekeeper', 'accountant')
export class InventoryController {
  constructor(private readonly stock: StockService) {}

  @Get('items')
  listItems(
    @CurrentUser() user: CurrentUserType,
    @Query('search') search?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.stock.listItems(facilityOf(user), { search, lowStock: lowStock === 'true' });
  }

  @Post('items')
  createItem(@CurrentUser() user: CurrentUserType, @Body() dto: CreateItemDto) {
    return this.stock.createItem(facilityOf(user), dto);
  }

  @Get('items/:id')
  getItem(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.stock.getItem(facilityOf(user), id);
  }

  @Patch('items/:id')
  updateItem(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.stock.updateItem(facilityOf(user), id, dto);
  }

  @Get('items/:id/ledger')
  itemLedger(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.stock.getItemLedger(facilityOf(user), id);
  }

  @Get('reports/performance')
  performance(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.stock.performanceReport(facilityOf(user), { from, to });
  }

  @Get('reports/stock-variance')
  stockVariance(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.stock.stockVariance(facilityOf(user), from, to);
  }

  @Get('expiry')
  expiry(@CurrentUser() user: CurrentUserType, @Query('withinDays') withinDays?: string) {
    return this.stock.expiryReport(facilityOf(user), withinDays ? Number(withinDays) : 90);
  }

  @Get('items/:id/batches')
  itemBatches(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.stock.listItemBatches(facilityOf(user), id);
  }

  @Post('items/:id/adjust')
  adjust(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.stock.adjustStock(facilityOf(user), id, dto);
  }

  @Post('stock-count')
  stockCount(@CurrentUser() user: CurrentUserType, @Body() dto: StockCountDto) {
    return this.stock.applyStockCount(facilityOf(user), dto.lines, dto.date);
  }
}

/** Procurement — suppliers, goods receipts, supplier payments. */
@ApiTags('procurement')
@ApiBearerAuth('JWT-auth')
@Controller('procurement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'procurement_officer', 'accountant')
export class ProcurementController {
  constructor(
    private readonly procurement: ProcurementService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly requisitions: PurchaseRequisitionService,
    private readonly quotations: QuotationService,
    private readonly invoices: SupplierInvoiceService,
  ) {}

  // ── Supplier invoices ───────────────────────────────────────────────────────

  @Get('invoices')
  listInvoices(@CurrentUser() user: CurrentUserType) {
    return this.invoices.list(facilityOf(user));
  }

  @Post('invoices')
  createInvoice(@CurrentUser() user: CurrentUserType, @Body() dto: CreateSupplierInvoiceDto) {
    return this.invoices.create(facilityOf(user), dto, user.id);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.invoices.get(facilityOf(user), id);
  }

  @Get('invoices/:id/match')
  matchInvoice(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.invoices.matchInfo(facilityOf(user), id);
  }

  // ── Quotations ──────────────────────────────────────────────────────────────

  @Get('quotations')
  listQuotations(@CurrentUser() user: CurrentUserType, @Query('requisitionId') requisitionId?: string) {
    return this.quotations.list(facilityOf(user), { requisitionId });
  }

  @Post('quotations')
  createQuotation(@CurrentUser() user: CurrentUserType, @Body() dto: CreateQuotationDto) {
    return this.quotations.create(facilityOf(user), dto, user.id);
  }

  @Get('quotations/:id')
  getQuotation(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.quotations.get(facilityOf(user), id);
  }

  @Patch('quotations/:id/select')
  selectQuotation(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.quotations.select(facilityOf(user), id);
  }

  @Patch('quotations/:id/reject')
  rejectQuotation(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.quotations.reject(facilityOf(user), id);
  }

  // ── Purchase requisitions (PRs) ─────────────────────────────────────────────

  @Get('requisitions')
  listRequisitions(@CurrentUser() user: CurrentUserType, @Query('status') status?: string) {
    return this.requisitions.list(facilityOf(user), status);
  }

  @Post('requisitions')
  createRequisition(@CurrentUser() user: CurrentUserType, @Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(facilityOf(user), dto, user);
  }

  @Get('requisitions/:id')
  getRequisition(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.requisitions.get(facilityOf(user), id);
  }

  @Patch('requisitions/:id/approve')
  approveRequisition(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.requisitions.approve(facilityOf(user), id, user, dto ?? {});
  }

  @Patch('requisitions/:id/reject')
  rejectRequisition(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.requisitions.reject(facilityOf(user), id, user, dto ?? {});
  }

  @Patch('requisitions/:id/cancel')
  cancelRequisition(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.requisitions.cancel(facilityOf(user), id, user);
  }

  // ── Purchase orders (LPOs) ──────────────────────────────────────────────────

  @Get('purchase-orders')
  listPurchaseOrders(@CurrentUser() user: CurrentUserType, @Query('status') status?: string) {
    return this.purchaseOrders.list(facilityOf(user), status);
  }

  @Post('purchase-orders')
  createPurchaseOrder(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrders.create(facilityOf(user), dto, user);
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.purchaseOrders.get(facilityOf(user), id);
  }

  @Patch('purchase-orders/:id/approve')
  approvePurchaseOrder(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.purchaseOrders.approve(facilityOf(user), id, user, dto ?? {});
  }

  @Patch('purchase-orders/:id/reject')
  rejectPurchaseOrder(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.purchaseOrders.reject(facilityOf(user), id, user, dto ?? {});
  }

  @Patch('purchase-orders/:id/cancel')
  cancelPurchaseOrder(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.purchaseOrders.cancel(facilityOf(user), id, user);
  }

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: CurrentUserType) {
    return this.procurement.listSuppliers(facilityOf(user));
  }

  @Post('suppliers')
  createSupplier(@CurrentUser() user: CurrentUserType, @Body() dto: CreateSupplierDto) {
    return this.procurement.createSupplier(facilityOf(user), dto);
  }

  @Patch('suppliers/:id')
  updateSupplier(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.procurement.updateSupplier(facilityOf(user), id, dto);
  }

  @Get('suppliers/:id/statement')
  supplierStatement(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.procurement.supplierStatement(facilityOf(user), id, { from, to });
  }

  @Get('goods-receipts')
  listGrns(@CurrentUser() user: CurrentUserType) {
    return this.procurement.listGoodsReceipts(facilityOf(user));
  }

  @Post('goods-receipts')
  receive(@CurrentUser() user: CurrentUserType, @Body() dto: CreateGoodsReceiptDto) {
    return this.procurement.receiveGoods(facilityOf(user), dto, user.id);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: CurrentUserType) {
    return this.procurement.listPayments(facilityOf(user));
  }

  @Post('payments')
  pay(@CurrentUser() user: CurrentUserType, @Body() dto: CreateSupplierPaymentDto) {
    return this.procurement.paySupplier(facilityOf(user), dto, user.id);
  }
}
