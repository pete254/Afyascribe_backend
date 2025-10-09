import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SoapNoteStatus } from '../enums/soap-note-status.enum';

export class UpdateSoapNoteStatusDto {
  @ApiProperty({
    enum: SoapNoteStatus,
    description: 'The status of the SOAP note',
    example: 'submitted'
  })
  @IsEnum(SoapNoteStatus, {
    message: 'Status must be one of: pending, submitted, reviewed, archived'
  })
  status: SoapNoteStatus;
}