// src/soap-notes/soap-notes.service.ts
// Auto-completes the patient's active visit when a SOAP note is saved
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
import { PatientVisitsService } from '../patient-visits/patient-visits.service';
import { EmailService } from '../common/services/email.service';

@Injectable()
export class SoapNotesService {
  constructor(
    @InjectRepository(SoapNote)
    private soapNotesRepository: Repository<SoapNote>,
    private patientsService: PatientsService,
    private patientVisitsService: PatientVisitsService,
    private emailService: EmailService,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────
  async create(
    createSoapNoteDto: CreateSoapNoteDto,
    userId: string,
    facilityId: string,
  ): Promise<SoapNote> {
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

    const saved = await this.soapNotesRepository.save(soapNote);

    // Auto-complete the patient's active visit when a SOAP note is saved
    await this.patientVisitsService.completeVisitForPatient(
      createSoapNoteDto.patientId,
      facilityId,
    );

    return saved;
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
      .where('soap_note.facilityId = :facilityId', { facilityId })
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

  // ── FIND BY PATIENT ────────────────────────────────────────────────────────
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

  // ── STATISTICS ─────────────────────────────────────────────────────────────
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

  // ── SAVE DRAFT ─────────────────────────────────────────────────────────────
  async saveDraft(
    dto: CreateSoapNoteDto,
    userId: string,
    facilityId: string,
    draftId?: string,
  ): Promise<SoapNote> {
    const patientExists = await this.patientsService.patientExists(dto.patientId, facilityId);
    if (!patientExists) {
      throw new BadRequestException(`Patient ${dto.patientId} not found in your facility`);
    }

    if (draftId) {
      const existing = await this.soapNotesRepository.findOne({
        where: { id: draftId, facilityId, createdById: userId, status: SoapNoteStatus.DRAFT },
      });
      if (!existing) {
        throw new NotFoundException(`Draft ${draftId} not found or already finalised`);
      }

      Object.assign(existing, {
        symptoms: dto.symptoms ?? existing.symptoms,
        physicalExamination: dto.physicalExamination ?? existing.physicalExamination,
        labInvestigations: dto.labInvestigations ?? existing.labInvestigations,
        imaging: dto.imaging ?? existing.imaging,
        diagnosis: dto.diagnosis ?? existing.diagnosis,
        icd10Code: dto.icd10Code ?? existing.icd10Code,
        icd10Description: dto.icd10Description ?? existing.icd10Description,
        management: dto.management ?? existing.management,
      });

      const saved = await this.soapNotesRepository.save(existing);
      console.log(`📝 Draft updated: ${saved.id}`);
      return saved;
    }

    const draft = this.soapNotesRepository.create({
      ...dto,
      symptoms: dto.symptoms ?? '',
      physicalExamination: dto.physicalExamination ?? '',
      labInvestigations: dto.labInvestigations ?? '',
      imaging: dto.imaging ?? '',
      diagnosis: dto.diagnosis ?? '',
      management: dto.management ?? '',
      createdById: userId,
      facilityId,
      status: SoapNoteStatus.DRAFT,
    });

    const saved = await this.soapNotesRepository.save(draft);
    console.log(`📝 Draft created: ${saved.id}`);
    return saved;
  }

  // ── GET MY DRAFTS ──────────────────────────────────────────────────────────
  async getMyDrafts(userId: string, facilityId: string): Promise<SoapNote[]> {
    return this.soapNotesRepository.find({
      where: { createdById: userId, facilityId, status: SoapNoteStatus.DRAFT },
      relations: ['patient'],
      order: { updatedAt: 'DESC' },
    });
  }

  // ── FINALISE DRAFT → sets status to 'pending' and auto-completes visit ─────
  async finaliseDraft(
    draftId: string,
    dto: CreateSoapNoteDto,
    userId: string,
    facilityId: string,
  ): Promise<SoapNote> {
    const draft = await this.soapNotesRepository.findOne({
      where: { id: draftId, facilityId, createdById: userId, status: SoapNoteStatus.DRAFT },
    });
    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const hasContent =
      (dto.symptoms ?? draft.symptoms)?.trim() ||
      (dto.physicalExamination ?? draft.physicalExamination)?.trim() ||
      (dto.diagnosis ?? draft.diagnosis)?.trim() ||
      (dto.management ?? draft.management)?.trim();

    if (!hasContent) {
      throw new BadRequestException('Cannot finalise a draft with no content');
    }

    Object.assign(draft, {
      symptoms: dto.symptoms ?? draft.symptoms ?? '',
      physicalExamination: dto.physicalExamination ?? draft.physicalExamination ?? '',
      labInvestigations: dto.labInvestigations ?? draft.labInvestigations ?? '',
      imaging: dto.imaging ?? draft.imaging ?? '',
      diagnosis: dto.diagnosis ?? draft.diagnosis ?? '',
      icd10Code: dto.icd10Code ?? draft.icd10Code,
      icd10Description: dto.icd10Description ?? draft.icd10Description,
      management: dto.management ?? draft.management ?? '',
      status: SoapNoteStatus.PENDING,
    });

    const saved = await this.soapNotesRepository.save(draft);
    console.log(`✅ Draft finalised → pending: ${saved.id}`);

    // Auto-complete the patient's active visit
    await this.patientVisitsService.completeVisitForPatient(
      draft.patientId,
      facilityId,
    );

    return saved;
  }

  // ── DELETE DRAFT ───────────────────────────────────────────────────────────
  async deleteDraft(draftId: string, userId: string, facilityId: string): Promise<void> {
    const draft = await this.soapNotesRepository.findOne({
      where: { id: draftId, facilityId, createdById: userId, status: SoapNoteStatus.DRAFT },
    });
    if (!draft) throw new NotFoundException(`Draft ${draftId} not found`);
    await this.soapNotesRepository.remove(draft);
    console.log(`🗑️ Draft deleted: ${draftId}`);
  }

  // ── EMAIL SOAP NOTE TO PATIENT ────────────────────────────────────────────
  async emailNoteToPatient(
    noteId: string,
    facilityId: string,
    requestingUserId: string,
  ): Promise<{ message: string }> {
    const note = await this.soapNotesRepository.findOne({
      where: { id: noteId, facilityId },
      relations: ['patient', 'createdBy', 'facility'],
    });

    if (!note) throw new NotFoundException(`Note ${noteId} not found`);

    const patientEmail = note.patient?.email;
    if (!patientEmail) {
      throw new BadRequestException(
        'Patient has no email address on file. Update the patient profile to add one.',
      );
    }

    const facilityName = note.facility?.name || 'Your Healthcare Provider';
    const doctorName = note.createdBy
      ? `Dr. ${note.createdBy.firstName} ${note.createdBy.lastName}`
      : 'Your Doctor';
    const patientName = `${note.patient.firstName} ${note.patient.lastName}`;
    const dateStr = new Date(note.createdAt).toLocaleDateString('en-KE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const sections = [
      note.symptoms && { label: 'Symptoms & History', value: note.symptoms },
      note.physicalExamination && {
        label: 'Physical Examination',
        value: note.physicalExamination,
      },
      note.labInvestigations && { label: 'Lab Investigations', value: note.labInvestigations },
      note.imaging && { label: 'Imaging', value: note.imaging },
      note.diagnosis && { label: 'Diagnosis', value: note.diagnosis },
      note.icd10Code && {
        label: 'ICD-10',
        value: `${note.icd10Code} — ${note.icd10Description || ''}`,
      },
      note.management && { label: 'Management Plan', value: note.management },
    ].filter(Boolean);

    const sectionHtml = sections
      .map(
        (s: any) => `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0f766e;margin-bottom:4px;">${s.label}</div>
        <div style="font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${s.value}</div>
      </div>`,
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;}
  .header{background:#0f766e;color:#fff;padding:28px 24px;border-radius:8px 8px 0 0;}
  .body{background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px;}
  .meta{background:#f8fafc;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#475569;}
  .divider{height:1px;background:#e2e8f0;margin:20px 0;}
  .footer{text-align:center;color:#94a3b8;font-size:12px;padding:16px 0;}
  .disclaimer{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-top:16px;font-size:12px;color:#92400e;}
</style></head>
<body>
  <div class="header">
    <div style="font-size:20px;font-weight:800;margin-bottom:4px;">🏥 ${facilityName}</div>
    <div style="opacity:.85;font-size:14px;">Medical Consultation Summary</div>
  </div>
  <div class="body">
    <p>Dear ${patientName},</p>
    <p>Please find below a summary of your consultation on <strong>${dateStr}</strong> with <strong>${doctorName}</strong>.</p>
    <div class="meta">
      <strong>Patient:</strong> ${patientName}<br>
      <strong>Date:</strong> ${dateStr}<br>
      <strong>Doctor:</strong> ${doctorName}<br>
      <strong>Facility:</strong> ${facilityName}
    </div>
    <div class="divider"></div>
    ${sectionHtml}
    <div class="disclaimer">
      <strong>⚕️ Medical Disclaimer:</strong> This summary is for your personal records only.
      Always follow the advice of your healthcare provider. If you have questions about your
      treatment, please contact ${facilityName} directly.
    </div>
  </div>
  <div class="footer">
    <p>This is an automated summary from ${facilityName} via AfyaScribe EMR.</p>
    <p>Please do not reply to this email.</p>
  </div>
</body>
</html>`;

    await this.emailService.sendCustomEmail(
      patientEmail,
      `Your Consultation Summary — ${facilityName} (${dateStr})`,
      html,
    );

    return { message: `Consultation summary sent to ${patientEmail}` };
  }
}