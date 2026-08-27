import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Employee } from './entities/employee.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { AccountingModule } from '../accounting/accounting.module';

/**
 * Human Resource / payroll: employees, statutory-aware payroll runs, and the
 * accrual + net-pay journals posted through HmisPostingService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, PayrollRun, Payslip, PayrollSettings, EmployeeDocument]),
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
  controllers: [PayrollController, EmployeeDocumentsController],
  providers: [PayrollService, EmployeeDocumentsService],
  exports: [PayrollService],
})
export class PayrollModule {}
