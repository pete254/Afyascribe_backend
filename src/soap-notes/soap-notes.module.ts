import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoapNotesController } from './soap-notes.controller';
import { SoapNotesService } from './soap-notes.service';
import { SoapNote } from './entities/soap-note.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SoapNote])],
  controllers: [SoapNotesController],
  providers: [SoapNotesService],
  exports: [SoapNotesService],
})
export class SoapNotesModule {}