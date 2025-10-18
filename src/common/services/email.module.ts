// src/common/services/email.module.ts
import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';

@Global() // Makes EmailService available everywhere
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}