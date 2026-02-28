// src/soap-notes/soap-notes.service.ts
// UPDATED: All queries scoped to facilityId — notes are fully isolated per facility
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(
    createSoapNoteDto: CreateSoapNoteDto,
    userId: string,
    facilityId: string,
  ): Promise<SoapNote> {
    // Verify patient belongs to same facility
    const patientExists = await this.patientsService.patientExists(
      createSoapNoteDto.patientId,
      facilityId,
    );
    if (!patientExists) {
      throw new BadRequestException(
        `Patient with ID ${createSoapNoteDto.patientId} not found in your facility`,
      );
    }

    const soapNote = this.soapNotesRepository.create({
      ...createSoapNoteDto,
      createdById: userId,
      facilityId,
    });

    return this.soapNotesRepository.save(soapNote);
  }

  // ── FIND ALL (paginated, scoped to facility) ───────────────────────────────

  async findAll(
    userId: string,
    facilityId: string,
    queryDto: QuerySoapNotesDto,
  ): Promise<PaginatedResponse<SoapNote>> {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const sortBy = queryDto.sortBy ?? 'createdAt';
    const sortOrder = queryDto.sortOrder ?? 'DESC';
    const { status, patientName } = queryDto;

    const qb = this.soapNotesRepository
      .createQueryBuilder('soap_note')
      .leftJoinAndSelect('soap_note.patient', 'patient')
      .leftJoinAndSelect('soap_note.createdBy', 'createdBy')
      // Facility scope — users only see notes from their own facility
      .where('soap_note.facilityId = :facilityId', { facilityId })
      // Doctors/nurses see their own notes; admins see all within facility
      .andWhere('soap_note.createdById = :userId', { userId });

    if (status) {
      qb.andWhere('soap_note.status = :status', { status });
    }

    if (patientName) {
      qb.andWhere(
        `(patient.firstName ILIKE :name OR patient.lastName ILIKE :name OR CONCAT(patient.firstName, ' ', patient.lastName) ILIKE :name)`,
        { name: `%${patientName}%` },
      );
    }

    const skip = (page - 1) * limit;
    qb.orderBy(`soap_note.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
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

  // ── FIND ALL FOR FACILITY (facility_admin view) ────────────────────────────

  async findAllForFacility(
    facilityId: string,
    queryDto: QuerySoapNotesDto,
  ): Promise<PaginatedResponse<SoapNote>> {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const sortBy = queryDto.sortBy ?? 'createdAt';
    const sortOrder = queryDto.sortOrder ?? 'DESC';

    const qb = this.soapNotesRepository
      .createQueryBuilder('soap_note')
      .leftJoinAndSelect('soap_note.patient', 'patient')
      .leftJoinAndSelect('soap_note.createdBy', 'createdBy')
      .where('soap_note.facilityId = :facilityId', { facilityId });

    const skip = (page - 1) * limit;
    qb.orderBy(`soap_note.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
    };
  }

  // ── FIND ONE (scoped to facility) ──────────────────────────────────────────

  async findOne(id: string, userId: string, facilityId: string): Promise<SoapNote> {
    const note = await this.soapNotesRepository.findOne({
      where: { id, createdById: userId, facilityId },
      relations: ['patient', 'createdBy'],
    });

    if (!note) throw new NotFoundException(`SOAP note with ID ${id} not found`);
    return note;
  }

  // ── FIND BY PATIENT (scoped to facility) ──────────────────────────────────

  async findByPatient(patientId: string, facilityId: string): Promise<SoapNote[]> {
    const patientExists = await this.patientsService.patientExists(patientId, facilityId);
    if (!patientExists) {
      throw new NotFoundException(`Patient with ID ${patientId} not found in your facility`);
    }

    return this.soapNotesRepository.find({
      where: { patientId, facilityId },
      relations: ['patient', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    updateSoapNoteDto: UpdateSoapNoteDto,
    userId: string,
    facilityId: string,
  ): Promise<SoapNote> {
    const note = await this.findOne(id, userId, facilityId);

    const contentFields = ['symptoms', 'physicalExamination', 'diagnosis', 'management'];
    const wasContentEdited = contentFields.some(
      (f) => updateSoapNoteDto[f] !== undefined && updateSoapNoteDto[f] !== note[f],
    );
    if (wasContentEdited) updateSoapNoteDto.wasEdited = true;

    Object.assign(note, updateSoapNoteDto);
    return this.soapNotesRepository.save(note);
  }

  // ── EDIT WITH HISTORY ──────────────────────────────────────────────────────

  async editWithHistory(
    id: string,
    updateData: {
      symptoms?: string;
      physicalExamination?: string;
      labInvestigations?: string;
      imaging?: string;
      diagnosis?: string;
      icd10Code?: string;
      icd10Description?: string;
      management?: string;
    },
    userId: string,
    userName: string,
    facilityId: string,
  ): Promise<SoapNote> {
    const note = await this.soapNotesRepository.findOne({
      where: { id, facilityId },
      relations: ['patient', 'createdBy'],
    });
    if (!note) throw new NotFoundException(`SOAP note with ID ${id} not found`);

    const fields = Object.keys(updateData) as Array<keyof typeof updateData>;
    const changes: { field: string; oldValue: string; newValue: string }[] = [];

    fields.forEach((field) => {
      if (updateData[field] !== undefined && updateData[field] !== note[field]) {
        changes.push({ field, oldValue: note[field] ?? '', newValue: updateData[field] });
      }
    });

    if (changes.length === 0) return note;

    if (!note.editHistory) note.editHistory = [];
    note.editHistory.push({ editedBy: userId, editedByName: userName, editedAt: new Date(), changes });

    Object.assign(note, updateData);
    note.lastEditedBy = userId;
    note.lastEditedByName = userName;
    note.lastEditedAt = new Date();
    note.wasEdited = true;

    return this.soapNotesRepository.save(note);
  }

  // ── STATUS ─────────────────────────────────────────────────────────────────

  async updateStatus(
    id: string,
    status: SoapNoteStatus,
    userId: string,
    facilityId: string,
  ): Promise<SoapNote> {
    const note = await this.findOne(id, userId, facilityId);
    note.status = status;
    if (status === SoapNoteStatus.SUBMITTED) note.submittedAt = new Date();
    return this.soapNotesRepository.save(note);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  async remove(id: string, userId: string, facilityId: string): Promise<void> {
    const note = await this.findOne(id, userId, facilityId);
    await this.soapNotesRepository.remove(note);
  }

  // ── STATISTICS (scoped to facility + user) ─────────────────────────────────

  async getStatistics(userId: string, facilityId: string) {
    const total = await this.soapNotesRepository.count({
      where: { createdById: userId, facilityId },
    });

    const byStatus = await this.soapNotesRepository
      .createQueryBuilder('soap_note')
      .select('soap_note.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('soap_note.createdById = :userId', { userId })
      .andWhere('soap_note.facilityId = :facilityId', { facilityId })
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