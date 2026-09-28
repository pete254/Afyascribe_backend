import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditReview } from './entities/audit-review.entity';
import { RecordVersion } from './entities/record-version.entity';
import { RecordVersionService } from './version.service';
import { RecordVersionSubscriber } from './version.subscriber';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

/**
 * System-wide audit ledger. The AuditInterceptor is registered globally, so it
 * captures every mutating request across every module without those modules
 * needing to know about auditing.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent, AuditReview, RecordVersion])],
  controllers: [AuditController],
  providers: [
    AuditService,
    RecordVersionService,
    RecordVersionSubscriber,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService, RecordVersionService],
})
export class AuditModule {}
