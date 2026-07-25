import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SupportRequest,
  SupportRequestStatus,
} from './entities/support-request.entity';
import { EmailService } from '../common/services/email.service';
import { CreateSupportRequestDto, ResolveSupportRequestDto } from './dto/platform.dto';

@Injectable()
export class SupportRequestsService {
  constructor(
    @InjectRepository(SupportRequest)
    private readonly repo: Repository<SupportRequest>,
    private readonly email: EmailService,
  ) {}

  async create(dto: CreateSupportRequestDto): Promise<{ id: string }> {
    const row = this.repo.create({
      type: dto.type,
      name: dto.name.trim(),
      email: dto.email.trim(),
      phone: dto.phone?.trim() || null,
      facilityName: dto.facilityName?.trim() || null,
      message: dto.message.trim(),
      status: SupportRequestStatus.OPEN,
    });
    const saved = await this.repo.save(row);
    return { id: saved.id };
  }

  async list(status?: SupportRequestStatus): Promise<SupportRequest[]> {
    return this.repo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async resolve(
    id: string,
    dto: ResolveSupportRequestDto,
    handledBy: string,
  ): Promise<SupportRequest> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Request not found');

    row.status = dto.status;
    row.handledBy = handledBy;
    row.handledAt = new Date();
    if (dto.response !== undefined) row.response = dto.response;

    const saved = await this.repo.save(row);

    // If the admin wrote a reply, email it back to the sender.
    if (dto.response && dto.response.trim()) {
      try {
        await this.email.sendCustomEmail(
          row.email,
          'AfyaScribe — response to your request',
          `
            <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
              <h2 style="color:#02A0A0;margin:0 0 12px;">AfyaScribe</h2>
              <p>Hello ${row.name},</p>
              <p>Thank you for reaching out. Here is our response:</p>
              <div style="background:#f1f5f9;border-left:4px solid #02A0A0;padding:12px 16px;margin:16px 0;border-radius:4px;white-space:pre-wrap;">${dto.response}</div>
              <p style="color:#64748b;font-size:14px;">You can reply to this email if you need anything further.</p>
            </div>
          `,
        );
      } catch {
        // The reply is recorded regardless; email delivery is best-effort.
      }
    }

    return saved;
  }
}
