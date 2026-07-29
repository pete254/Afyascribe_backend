import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { LedgerAccount } from './entities/ledger-account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { LedgerService } from './ledger.service';
import { AccountingController } from './accounting.controller';

/**
 * The accounting core: the chart of accounts and the double-entry general
 * ledger. LedgerService is exported so operational modules (billing, pharmacy,
 * procurement, payroll) can post balanced journals for the transactions they
 * generate.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerAccount, JournalEntry, JournalLine]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AccountingController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class AccountingModule {}
