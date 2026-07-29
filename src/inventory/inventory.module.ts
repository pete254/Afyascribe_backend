import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { InventoryItem } from './entities/inventory-item.entity';
import { Supplier } from './entities/supplier.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';

import { StockService } from './stock.service';
import { ProcurementService } from './procurement.service';
import { InventoryController, ProcurementController } from './inventory.controller';
import { AccountingModule } from '../accounting/accounting.module';

/**
 * Inventory + procurement: item master and moving-average stock ledger, plus
 * suppliers, goods receipts and supplier payments — each auto-posting into the
 * general ledger via HmisPostingService (from AccountingModule). StockService
 * is exported so pharmacy/lab dispensing can issue stock at cost.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryItem,
      Supplier,
      StockMovement,
      GoodsReceipt,
      GoodsReceiptLine,
      SupplierPayment,
    ]),
    AccountingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [InventoryController, ProcurementController],
  providers: [StockService, ProcurementService],
  exports: [StockService, ProcurementService],
})
export class InventoryModule {}
