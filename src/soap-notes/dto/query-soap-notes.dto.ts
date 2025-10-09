// src/soap-notes/dto/query-soap-notes.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SoapNoteStatus } from '../enums/soap-note-status.enum';

export class QuerySoapNotesDto extends PaginationDto {
  @ApiPropertyOptional({ 
    enum: SoapNoteStatus,
    description: 'Filter by status'
  })
  @IsOptional()
  @IsEnum(SoapNoteStatus)
  status?: SoapNoteStatus;

  @ApiPropertyOptional({ 
    description: 'Search by patient name' 
  })
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional({ 
    enum: ['createdAt', 'updatedAt', 'patientName'],
    default: 'createdAt',
    description: 'Sort field'
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ 
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    description: 'Sort order'
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}