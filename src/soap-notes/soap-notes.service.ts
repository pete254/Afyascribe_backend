// src/soap-notes/soap-notes.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SoapNote } from './entities/soap-note.entity';
import { CreateSoapNoteDto } from './dto/create-soap-note.dto';
import { UpdateSoapNoteDto } from './dto/update-soap-note.dto';
import { QuerySoapNotesDto } from './dto/query-soap-notes.dto';
import { SoapNoteStatus } from './enums/soap-note-status.enum';
import { PaginatedResponse } from '../common/dto/pagination.dto';
import { PatientsService } from '../patients/patients.service';

@Injectable()
export class SoapNotesService {
  constructor(
    @InjectRepository(SoapNote)
    private soapNotesRepository: Repository<SoapNote>,
    private patientsService: PatientsService,
  ) {}

  async create(createSoapNoteDto: CreateSoapNoteDto, userId: string): Promise<SoapNote> {
    // Validate that patient exists
    const patientExists = await this.patientsService.patientExists(createSoapNoteDto.patientId);
    if (!patientExists) {
      throw new BadRequestException(`Patient with ID ${createSoapNoteDto.patientId} not found`);
    }

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
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const sortBy = queryDto.sortBy ?? 'createdAt';
    const sortOrder = queryDto.sortOrder ?? 'DESC';
    const { status, patientName } = queryDto;
    
    const queryBuilder = this.soapNotesRepository
      .createQueryBuilder('soap_note')
      .leftJoinAndSelect('soap_note.patient', 'patient')
      .leftJoinAndSelect('soap_note.createdBy', 'createdBy')
      .where('soap_note.createdById = :userId', { userId });
    
    if (status) {
      queryBuilder.andWhere('soap_note.status = :status', { status });
    }
    
    if (patientName) {
      queryBuilder.andWhere(
        "(patient.firstName ILIKE :patientName OR patient.lastName ILIKE :patientName OR CONCAT(patient.firstName, ' ', patient.lastName) ILIKE :patientName)",
        { patientName: `%${patientName}%` }
      );
    }

    const skip = (page - 1) * limit;
    queryBuilder
      .orderBy(`soap_note.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

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
      relations: ['patient', 'createdBy'],
    });
    
    if (!soapNote) {
      throw new NotFoundException(`SOAP note with ID ${id} not found`);
    }
    
    return soapNote;
  }

  // 🆕 NEW: Get all notes for a specific patient
  async findByPatient(patientId: string): Promise<SoapNote[]> {
    // Verify patient exists
    const patientExists = await this.patientsService.patientExists(patientId);
    if (!patientExists) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const notes = await this.soapNotesRepository.find({
      where: { patientId },
      relations: ['patient', 'createdBy'],
      order: { createdAt: 'DESC' }, // Most recent first
    });

    return notes;
  }

  async update(id: string, updateSoapNoteDto: UpdateSoapNoteDto, userId: string): Promise<SoapNote> {
    const soapNote = await this.findOne(id, userId);
    
    // Mark as edited if any content fields were changed
    const contentFields = ['symptoms', 'physicalExamination', 'diagnosis', 'management'];
    const wasContentEdited = contentFields.some(field => 
      updateSoapNoteDto[field] !== undefined && updateSoapNoteDto[field] !== soapNote[field]
    );
    
    if (wasContentEdited) {
      updateSoapNoteDto.wasEdited = true;
    }
    
    Object.assign(soapNote, updateSoapNoteDto);
    return await this.soapNotesRepository.save(soapNote);
  }

  // 🆕 NEW: Edit note with history tracking
  async editWithHistory(
    id: string,
    updateData: {
      symptoms?: string;
      physicalExamination?: string;
      diagnosis?: string;
      management?: string;
    },
    userId: string,
    userName: string,
  ): Promise<SoapNote> {
    const note = await this.soapNotesRepository.findOne({
      where: { id },
      relations: ['patient', 'createdBy'],
    });

    if (!note) {
      throw new NotFoundException(`SOAP note with ID ${id} not found`);
    }

    // Track what changed
    const changes: Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];
    const fields: Array<keyof typeof updateData> = ['symptoms', 'physicalExamination', 'diagnosis', 'management'];
    
    fields.forEach(field => {
      if (updateData[field] !== undefined && updateData[field] !== note[field]) {
        changes.push({
          field,
          oldValue: note[field],
          newValue: updateData[field],
        });
      }
    });

    // Only save if there are actual changes
    if (changes.length === 0) {
      return note; // No changes, return as is
    }

    // Initialize editHistory if it doesn't exist
    if (!note.editHistory) {
      note.editHistory = [];
    }

    // Add edit entry to history
    note.editHistory.push({
      editedBy: userId,
      editedByName: userName,
      editedAt: new Date(),
      changes,
    });

    // Update the fields
    Object.assign(note, updateData);

    // Update last edited metadata
    note.lastEditedBy = userId;
    note.lastEditedByName = userName;
    note.lastEditedAt = new Date();
    note.wasEdited = true;

    return await this.soapNotesRepository.save(note);
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