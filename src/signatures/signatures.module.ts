import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PractitionerKey } from './entities/practitioner-key.entity';
import { RecordSignature } from './entities/record-signature.entity';
import { User } from '../users/entities/user.entity';
import { SignaturesService } from './signatures.service';
import { SignaturesController } from './signatures.controller';

/** Digital signatures over clinical records, with a key per practitioner. */
@Module({
  imports: [TypeOrmModule.forFeature([PractitionerKey, RecordSignature, User])],
  controllers: [SignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
