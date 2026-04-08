// src/appointments/appointments.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Appointment, AppointmentStatus } from './entities/appointment.entity';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { EmailService } from '../common/services/email.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly repo: Repository<Appointment>,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────
  async create(
    dto: CreateAppointmentDto,
    doctorId: string,
    facilityId: string,
  ): Promise<Appointment> {
    const appointment = this.repo.create({
      ...dto,
      doctorId,
      facilityId,
      soapNoteId: dto.soapNoteId ?? null,
      customReason: dto.customReason ?? null,
      notes: dto.notes ?? null,
    });

    const saved = await this.repo.save(appointment);

    // Load with relations for email
    const full = await this.repo.findOne({
      where: { id: saved.id },
      relations: ['patient', 'doctor', 'facility'],
    });

    if (full) {
      await this._sendConfirmationEmail(full);
    }

    return saved;
  }

  // ── GET TODAY'S APPOINTMENTS FOR DOCTOR ────────────────────────────────────
  async getTodayForDoctor(doctorId: string, facilityId: string): Promise<Appointment[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.repo.find({
      where: { doctorId, facilityId, appointmentDate: today },
      relations: ['patient'],
      order: { appointmentTime: 'ASC' },
    });
  }

  // ── GET FOR PATIENT ────────────────────────────────────────────────────────
  async getForPatient(patientId: string, facilityId: string): Promise<Appointment[]> {
    return this.repo.find({
      where: { patientId, facilityId },
      relations: ['doctor'],
      order: { appointmentDate: 'DESC', appointmentTime: 'DESC' },
    });
  }

  // ── GET ALL FOR FACILITY ───────────────────────────────────────────────────
  async getAllForFacility(
    facilityId: string,
    date?: string,
  ): Promise<Appointment[]> {
    const where: any = { facilityId };
    if (date) where.appointmentDate = date;
    return this.repo.find({
      where,
      relations: ['patient', 'doctor'],
      order: { appointmentDate: 'ASC', appointmentTime: 'ASC' },
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateAppointmentDto,
    facilityId: string,
  ): Promise<Appointment> {
    const appt = await this.repo.findOne({ where: { id, facilityId }, relations: ['patient', 'doctor', 'facility'] });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);

    Object.assign(appt, dto);
    const saved = await this.repo.save(appt);

    // Send rescheduled email if date/time changed
    if (dto.appointmentDate || dto.appointmentTime) {
      await this._sendRescheduledEmail(saved);
    }

    return saved;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  async remove(id: string, facilityId: string): Promise<void> {
    const appt = await this.repo.findOne({ where: { id, facilityId } });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    await this.repo.remove(appt);
  }

  // ── CRON: Send reminders 2 days before ────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendReminders(): Promise<void> {
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const targetDate = twoDaysFromNow.toISOString().split('T')[0];

    this.logger.log(`📅 Sending reminders for appointments on ${targetDate}`);

    const upcoming = await this.repo.find({
      where: {
        appointmentDate: targetDate,
        status: AppointmentStatus.SCHEDULED,
        reminderSent: false,
      },
      relations: ['patient', 'doctor', 'facility'],
    });

    for (const appt of upcoming) {
      try {
        await this._sendReminderEmail(appt);
        await this.repo.update(appt.id, { reminderSent: true });
        this.logger.log(`✅ Reminder sent for appointment ${appt.id}`);
      } catch (e) {
        this.logger.error(`❌ Failed to send reminder for ${appt.id}: ${e.message}`);
      }
    }
  }

  // ── EMAIL: Confirmation ────────────────────────────────────────────────────
  private async _sendConfirmationEmail(appt: Appointment): Promise<void> {
    const patientEmail = appt.patient?.email;
    if (!patientEmail) return;

    const doctorName = `Dr. ${appt.doctor?.firstName} ${appt.doctor?.lastName}`;
    const facilityName = appt.facility?.name || 'Our Facility';
    const dateStr = new Date(appt.appointmentDate + 'T00:00:00').toLocaleDateString('en-KE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const reason = appt.customReason || appt.reason;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #0f766e; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
.body { background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-top: 0; }
.detail-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
.detail-row { display: flex; margin-bottom: 12px; }
.detail-label { font-weight: 600; color: #0f766e; min-width: 120px; }
.footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px; }
</style></head>
<body>
<div class="header">
  <h1 style="margin:0;font-size:24px;">🏥 ${facilityName}</h1>
  <p style="margin:8px 0 0;opacity:0.9;">Appointment Confirmation</p>
</div>
<div class="body">
  <p>Dear ${appt.patient?.firstName} ${appt.patient?.lastName},</p>
  <p>Your appointment has been scheduled. Please find the details below:</p>
  <div class="detail-box">
    <div class="detail-row"><span class="detail-label">📅 Date:</span><span>${dateStr}</span></div>
    <div class="detail-row"><span class="detail-label">⏰ Time:</span><span>${appt.appointmentTime}</span></div>
    <div class="detail-row"><span class="detail-label">👨‍⚕️ Doctor:</span><span>${doctorName}</span></div>
    <div class="detail-row"><span class="detail-label">📋 Reason:</span><span>${reason}</span></div>
    ${appt.notes ? `<div class="detail-row"><span class="detail-label">📝 Notes:</span><span>${appt.notes}</span></div>` : ''}
  </div>
  <p><strong>Please arrive 10 minutes before your scheduled time.</strong></p>
  <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
  <p>Best regards,<br><strong>${facilityName}</strong></p>
</div>
<div class="footer">This is an automated message from ${facilityName} via AfyaScribe. Please do not reply to this email.</div>
</body></html>`;

    try {
      await this.emailService.sendCustomEmail(
        patientEmail,
        `Appointment Confirmation – ${facilityName}`,
        html,
      );
      await this.repo.update(appt.id, { confirmationSent: true });
    } catch (e) {
      this.logger.error(`Failed to send confirmation email: ${e.message}`);
    }
  }

  // ── EMAIL: Reminder ────────────────────────────────────────────────────────
  private async _sendReminderEmail(appt: Appointment): Promise<void> {
    const patientEmail = appt.patient?.email;
    if (!patientEmail) return;

    const doctorName = `Dr. ${appt.doctor?.firstName} ${appt.doctor?.lastName}`;
    const facilityName = appt.facility?.name || 'Our Facility';
    const dateStr = new Date(appt.appointmentDate + 'T00:00:00').toLocaleDateString('en-KE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const reason = appt.customReason || appt.reason;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #f59e0b; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
.body { background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-top: 0; }
.reminder-box { background: #fffbeb; border: 2px solid #fde68a; border-radius: 8px; padding: 20px; margin: 20px 0; }
.detail-label { font-weight: 600; color: #b45309; }
.footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px; }
</style></head>
<body>
<div class="header">
  <h1 style="margin:0;font-size:24px;">⏰ Appointment Reminder</h1>
  <p style="margin:8px 0 0;opacity:0.9;">${facilityName}</p>
</div>
<div class="body">
  <p>Dear ${appt.patient?.firstName} ${appt.patient?.lastName},</p>
  <p>This is a friendly reminder that you have an appointment in <strong>2 days</strong>.</p>
  <div class="reminder-box">
    <p><span class="detail-label">📅 Date:</span> ${dateStr}</p>
    <p><span class="detail-label">⏰ Time:</span> ${appt.appointmentTime}</p>
    <p><span class="detail-label">👨‍⚕️ Doctor:</span> ${doctorName}</p>
    <p><span class="detail-label">📋 Reason:</span> ${reason}</p>
  </div>
  <p>Please arrive 10 minutes early. If you cannot attend, please contact us to reschedule.</p>
  <p>Best regards,<br><strong>${facilityName}</strong></p>
</div>
<div class="footer">This is an automated reminder from ${facilityName} via AfyaScribe.</div>
</body></html>`;

    await this.emailService.sendCustomEmail(
      patientEmail,
      `Appointment Reminder – ${facilityName} (2 days away)`,
      html,
    );
  }

  // ── EMAIL: Rescheduled ─────────────────────────────────────────────────────
  private async _sendRescheduledEmail(appt: Appointment): Promise<void> {
    const patientEmail = appt.patient?.email;
    if (!patientEmail) return;

    const facilityName = appt.facility?.name || 'Our Facility';
    const dateStr = new Date(appt.appointmentDate + 'T00:00:00').toLocaleDateString('en-KE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#2563eb;color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="margin:0;">📅 Appointment Rescheduled</h1>
    <p style="margin:8px 0 0;opacity:0.9;">${facilityName}</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:0;">
    <p>Dear ${appt.patient?.firstName},</p>
    <p>Your appointment has been rescheduled. New details:</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">
      <p><strong>📅 New Date:</strong> ${dateStr}</p>
      <p><strong>⏰ New Time:</strong> ${appt.appointmentTime}</p>
    </div>
    <p>If you have any questions, please contact ${facilityName}.</p>
  </div>
</body></html>`;

    try {
      await this.emailService.sendCustomEmail(
        patientEmail,
        `Appointment Rescheduled – ${facilityName}`,
        html,
      );
    } catch (e) {
      this.logger.error(`Failed to send reschedule email: ${e.message}`);
    }
  }
}