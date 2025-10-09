import { PartialType } from '@nestjs/swagger';
import { CreateSoapNoteDto } from './create-soap-note.dto';

export class UpdateSoapNoteDto extends PartialType(CreateSoapNoteDto) {}
