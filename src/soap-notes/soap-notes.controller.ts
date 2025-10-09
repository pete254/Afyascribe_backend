// src/soap-notes/soap-notes.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Request,
  Query,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SoapNotesService } from './soap-notes.service';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { UpdateSoapNoteStatusDto } from './dto/update-soap-note-status.dto';
import { QuerySoapNotesDto } from './dto/query-soap-notes.dto';
import { 
  ApiTags, 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse,
  ApiQuery 
} from '@nestjs/swagger';

@ApiTags('soap-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('soap-notes')
export class SoapNotesController {
  constructor(private readonly soapNotesService: SoapNotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new SOAP note' })
  @ApiResponse({ 
    status: 201, 
    description: 'SOAP note created successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  create(@Body() createSoapNoteDto: CreateSoapNoteDto, @Request() req) {
    return this.soapNotesService.create(createSoapNoteDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all SOAP notes for current user with pagination and filtering' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns paginated SOAP notes' 
  })
  findAll(@Query() queryDto: QuerySoapNotesDto, @Request() req) {
    return this.soapNotesService.findAll(req.user.userId, queryDto);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get SOAP notes statistics for current user' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns statistics' 
  })
  getStatistics(@Request() req) {
    return this.soapNotesService.getStatistics(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific SOAP note' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns the SOAP note' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  findOne(@Param('id') id: string, @Request() req) {
    return this.soapNotesService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a SOAP note' })
  @ApiResponse({ 
    status: 200, 
    description: 'SOAP note updated successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  update(@Param('id') id: string, @Body() updateSoapNoteDto: UpdateSoapNoteDto, @Request() req) {
    return this.soapNotesService.update(id, updateSoapNoteDto, req.user.userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update SOAP note status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Status updated successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid status value' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  updateStatus(
    @Param('id') id: string, 
    @Body() updateStatusDto: UpdateSoapNoteStatusDto, 
    @Request() req
  ) {
    return this.soapNotesService.updateStatus(id, updateStatusDto.status, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a SOAP note' })
  @ApiResponse({ 
    status: 204, 
    description: 'SOAP note deleted successfully' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'SOAP note not found' 
  })
  remove(@Param('id') id: string, @Request() req) {
    return this.soapNotesService.remove(id, req.user.userId);
  }
}