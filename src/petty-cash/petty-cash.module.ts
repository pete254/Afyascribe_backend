import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PettyCashVoucher } from './entities/petty-cash-voucher.entity';
import { PettyCashService } from './petty-cash.service';
import { PettyCashController } from './petty-cash.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  // AccountingModule provides LedgerService, so every petty-cash voucher posts a
  // balanced journal (Dr/Cr Petty Cash 11002) into the general ledger.
  imports: [TypeOrmModule.forFeature([PettyCashVoucher]), AccountingModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
