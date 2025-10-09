// src/soap-notes/soap-notes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { SoapNote } from './entities/soap-note.entity';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { QuerySoapNotesDto } from './dto/query-soap-notes.dto';
import { SoapNoteStatus } from './enums/soap-note-status.enum';
import { PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class SoapNotesService {
  constructor(
    @InjectRepository(SoapNote)
    private soapNotesRepository: Repository<SoapNote>,
  ) {}

  async create(createSoapNoteDto: CreateSoapNoteDto, userId: string): Promise<SoapNote> {
    const soapNote = this.soapNotesRepository.create({
      ...createSoapNoteDto,
      createdById: userId,
    });
    return await this.soapNotesRepository.save(soapNote);
  }

  async findAll(
    userId: string, 
    queryDto: QuerySoapNotesDto
  ): Promise<PaginatedResponse<SoapNote>> {
    // Set default values for pagination
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const sortBy = queryDto.sortBy ?? 'createdAt';
    const sortOrder = queryDto.sortOrder ?? 'DESC';
    const { status, patientName } = queryDto;
    
    // Build where clause
    const where: any = { createdById: userId };
    
    if (status) {
      where.status = status;
    }
    
    if (patientName) {
      where.patientName = Like(`%${patientName}%`);
    }

    // Calculate skip
    const skip = (page - 1) * limit;

    // Build order object
    const order: any = {};
    order[sortBy] = sortOrder;

    // Get data and total count
    const [data, total] = await this.soapNotesRepository.findAndCount({
      where,
      order,
      skip,
      take: limit,
      relations: ['createdBy'],
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string, userId: string): Promise<SoapNote> {
    const soapNote = await this.soapNotesRepository.findOne({
      where: { id, createdById: userId },
      relations: ['createdBy'],
    });
    
    if (!soapNote) {
      throw new NotFoundException(`SOAP note with ID ${id} not found`);
    }
    
    return soapNote;
  }

  async update(id: string, updateSoapNoteDto: UpdateSoapNoteDto, userId: string): Promise<SoapNote> {
    const soapNote = await this.findOne(id, userId);
    
    // Mark as edited if any content fields were changed
    const contentFields = ['originalTranscription', 'formattedSoapNotes', 'patientName', 'patientAge', 'patientGender'];
    const wasContentEdited = contentFields.some(field => 
      updateSoapNoteDto[field] !== undefined && updateSoapNoteDto[field] !== soapNote[field]
    );
    
    if (wasContentEdited) {
      updateSoapNoteDto.wasEdited = true;
    }
    
    Object.assign(soapNote, updateSoapNoteDto);
    return await this.soapNotesRepository.save(soapNote);
  }

  async updateStatus(id: string, status: SoapNoteStatus, userId: string): Promise<SoapNote> {
    const soapNote = await this.findOne(id, userId);
    soapNote.status = status;
    
    if (status === SoapNoteStatus.SUBMITTED) {
      soapNote.submittedAt = new Date();
    }
    
    return await this.soapNotesRepository.save(soapNote);
  }

  async remove(id: string, userId: string): Promise<void> {
    const soapNote = await this.findOne(id, userId);
    await this.soapNotesRepository.remove(soapNote);
  }

  // Statistics method for dashboard
  async getStatistics(userId: string) {
    const qb = this.soapNotesRepository.createQueryBuilder('soap_note')
      .where('soap_note.createdById = :userId', { userId });

    const total = await qb.getCount();
    
    const byStatus = await this.soapNotesRepository
      .createQueryBuilder('soap_note')
      .select('soap_note.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('soap_note.createdById = :userId', { userId })
      .groupBy('soap_note.status')
      .getRawMany();

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
    };
  }
}