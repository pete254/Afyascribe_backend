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
import {
  CreateItemDto,
  UpdateItemDto,
  AdjustStockDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateGoodsReceiptDto,
  CreateSupplierPaymentDto,
} from './dto/inventory.dto';
import { CreatePurchaseOrderDto, DecisionDto } from './dto/purchase-order.dto';

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

  @Post('items/:id/adjust')
  adjust(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.stock.adjustStock(facilityOf(user), id, dto);
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
  ) {}

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
