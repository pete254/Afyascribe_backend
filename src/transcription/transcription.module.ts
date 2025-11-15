import { Module } from '@nestjs/common';
import { TranscriptionController } from './transcription.controller';

@Module({
  controllers: [TranscriptionController],
})
export class TranscriptionModule {}