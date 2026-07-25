import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facility, FacilityStatus } from '../facilities/entities/facility.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { EmailService } from '../common/services/email.service';
import { SendReminderDto } from './dto/platform.dto';

/**
 * Everything AfyaScribe (super_admin) does to a facility from the platform
 * console: see them all with their owner and billing state, pause / resume
 * access, set the next due date, and nudge a facility whose payment is due.
 */
@Injectable()
export class PlatformFacilitiesService {
  constructor(
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly email: EmailService,
  ) {}

  /** All facilities with their owner and staff count — the console's main table. */
  async list() {
    const facilities = await this.facilities.find({ order: { createdAt: 'DESC' } });

    return Promise.all(
      facilities.map(async (f) => {
        const owner = await this.users.findOne({
          where: { facilityId: f.id, isOwner: true } as any,
        });
        const staffCount = await this.users.count({ where: { facilityId: f.id } as any });
        const due = f.subscriptionDueDate ? new Date(f.subscriptionDueDate) : null;

        return {
          id: f.id,
          name: f.name,
          code: f.code,
          type: f.type,
          status: f.status,
          clinicMode: f.clinicMode,
          email: f.email ?? owner?.email ?? null,
          subscriptionDueDate: due,
          overdue: !!due && due.getTime() < Date.now() && f.status === FacilityStatus.ACTIVE,
          staffCount,
          owner: owner
            ? {
                id: owner.id,
                name: `${owner.firstName} ${owner.lastName}`.trim(),
                email: owner.email,
              }
            : null,
          createdAt: f.createdAt,
        };
      }),
    );
  }

  async setStatus(id: string, status: FacilityStatus): Promise<Facility> {
    const facility = await this.facilities.findOne({ where: { id } });
    if (!facility) throw new NotFoundException('Facility not found');
    facility.status = status;
    facility.isActive = status === FacilityStatus.ACTIVE;
    return this.facilities.save(facility);
  }

  async setSubscription(id: string, dueDate?: string | null): Promise<Facility> {
    const facility = await this.facilities.findOne({ where: { id } });
    if (!facility) throw new NotFoundException('Facility not found');
    facility.subscriptionDueDate = dueDate ? new Date(dueDate) : null;
    return this.facilities.save(facility);
  }

  /** Email the facility's billing contact that payment is due. */
  async sendReminder(id: string, dto: SendReminderDto): Promise<{ sent: boolean; to: string }> {
    const facility = await this.facilities.findOne({ where: { id } });
    if (!facility) throw new NotFoundException('Facility not found');

    const owner = await this.users.findOne({
      where: { facilityId: id, isOwner: true } as any,
    });
    const to = facility.email || owner?.email;
    if (!to) throw new NotFoundException('No billing email on file for this facility.');

    const due = facility.subscriptionDueDate
      ? new Date(facility.subscriptionDueDate).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

    await this.email.sendCustomEmail(
      to,
      'AfyaScribe subscription — payment reminder',
      this.reminderTemplate(facility.name, due, dto.message),
      facility.logoUrl ?? null,
    );

    return { sent: true, to };
  }

  private reminderTemplate(facilityName: string, due: string | null, note?: string): string {
    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
        <h2 style="color:#02A0A0;margin:0 0 4px;">AfyaScribe</h2>
        <h3 style="margin:16px 0 8px;">Subscription payment reminder</h3>
        <p>Hello ${facilityName},</p>
        <p>
          This is a friendly reminder about your AfyaScribe subscription${
            due ? `, which is due on <strong>${due}</strong>` : ''
          }.
          Please settle it to keep your facility's access uninterrupted.
        </p>
        ${
          note
            ? `<div style="background:#f1f5f9;border-left:4px solid #02A0A0;padding:12px 16px;margin:16px 0;border-radius:4px;">${note}</div>`
            : ''
        }
        <p style="color:#64748b;font-size:14px;margin-top:24px;">
          If you have already paid, please disregard this message. Reply to this email for any questions.
        </p>
      </div>
    `;
  }
}
