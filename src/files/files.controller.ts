import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { clientIp } from '../common/client-ip';
import { Facility } from '../facilities/entities/facility.entity';
import { PatientDocument } from '../patient-documents/entities/patient-document.entity';
import { EmployeeDocument } from '../payroll/entities/employee-document.entity';
import { User } from '../users/entities/user.entity';
import { FileKind, linkValid } from './file-links';
import { FilesService } from './files.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Serves uploaded files. No sign-in token here — the apps open these links
 * from `<img>`, `<a>` and the phone's viewer, which cannot send one — so each
 * document link carries its own signature instead (see file-links.ts). Logos
 * are public: they are printed on receipts and sent in emails, and identify
 * no one.
 *
 * Any failure is the same 404, so a guess learns nothing about which
 * documents exist.
 */
@ApiExcludeController()
@Public()
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
    @InjectRepository(PatientDocument)
    private readonly patientDocs: Repository<PatientDocument>,
    @InjectRepository(EmployeeDocument)
    private readonly staffDocs: Repository<EmployeeDocument>,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get('doc/:id')
  async patientDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const doc = await this.authorised('doc', id, q, () =>
      this.patientDocs.findOne({ where: { id } }),
    );
    await this.record(
      req,
      q.u,
      doc,
      'Opened patient document',
      'patient documents',
      doc.patientId,
    );
    await this.send(res, doc.storageKey, doc.fileType, doc.fileName, false);
  }

  @Get('staff/:id')
  async staffDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const doc = await this.authorised('staff', id, q, () =>
      this.staffDocs.findOne({ where: { id } }),
    );
    await this.record(
      req,
      q.u,
      doc,
      'Opened employee document',
      'employee documents',
      null,
    );
    await this.send(res, doc.storageKey, doc.fileType, doc.fileName, false);
  }

  @Get('logo/:facilityId')
  async logo(
    @Param('facilityId', ParseUUIDPipe) facilityId: string,
    @Res() res: Response,
  ) {
    const facility = await this.facilities.findOne({
      where: { id: facilityId },
    });
    if (!facility?.logoKey) throw new NotFoundException();
    const mime = facility.logoKey.endsWith('.png')
      ? 'image/png'
      : facility.logoKey.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    await this.send(res, facility.logoKey, mime, 'logo', true);
  }

  private async authorised<T extends { storageKey: string | null }>(
    kind: FileKind,
    id: string,
    q: Record<string, string>,
    load: () => Promise<T | null>,
  ): Promise<T> {
    if (!linkValid(this.files.linkSecret, kind, id, q.u, q.e, q.s))
      throw new NotFoundException();
    const doc = await load();
    if (!doc?.storageKey) throw new NotFoundException();
    return doc;
  }

  private async record(
    req: Request,
    userId: string,
    doc: { id: string; facilityId: string },
    action: string,
    entityType: string,
    patientId: string | null,
  ) {
    const user = await this.users.findOne({ where: { id: userId } });
    await this.audit.log({
      facilityId: doc.facilityId,
      actorId: userId,
      actorName: user
        ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
        : null,
      actorRole: user?.role ?? null,
      method: 'GET',
      path: String(req.originalUrl ?? req.url).split('?')[0],
      action,
      entityType,
      entityId: doc.id,
      statusCode: 200,
      ip: clientIp(req),
      category: 'read',
      patientId,
    });
  }

  private async send(
    res: Response,
    key: string,
    mime: string,
    name: string,
    isPublic: boolean,
  ) {
    const file = await this.files.existing(key);
    if (!file) throw new NotFoundException();
    res.setHeader('Content-Type', mime);
    // Shown in the browser's own viewer, under the name it was uploaded with.
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    // The web app is on another origin; without this, helmet's same-origin
    // default stops it showing the image.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader(
      'Cache-Control',
      isPublic ? 'public, max-age=86400' : 'private, no-store',
    );
    res.sendFile(file);
  }
}
