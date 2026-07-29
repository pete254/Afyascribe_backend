import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Employee } from './entities/employee.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { AccountingModule } from '../accounting/accounting.module';

/**
 * Human Resource / payroll: employees, statutory-aware payroll runs, and the
 * accrual + net-pay journals posted through HmisPostingService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, PayrollRun, Payslip]),
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
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
