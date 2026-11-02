import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../common/services/email.service';
import {
  Facility,
  FacilityStatus,
} from '../facilities/entities/facility.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SurveillanceService } from './surveillance.service';
import { WeeklyReturnService } from './weekly.service';
import { ESCALATE_AFTER } from './retry';
import { lastCompleteWeek } from './epiweek';
import { DiseaseNotification } from './entities/disease-notification.entity';
import { WeeklyReturn } from './entities/weekly-return.entity';

const TZ = 'Africa/Nairobi';

/**
 * Surveillance that does not wait to be looked at.
 *
 * - D-3 / I-6: resend failed cases and returns, backing off, and email the
 *   facility once sending has failed ESCALATE_AFTER times.
 * - D-8 / I-3: email when an immediate case passes 24 hours unnotified, and on
 *   Monday morning when last week has no submitted return, or the week's
 *   figures crossed a threshold.
 *
 * Emails go to the facility's surveillance contact, or its administrators,
 * and carry no patient's name or number: they say what needs doing and where,
 * and the record stays behind the sign-in.
 *
 * Each job keeps its own record of what it sent (overdue_reminded_at,
 * alert_escalated_at, idsr_reminded_week), so a restart or a second run never
 * sends the same reminder twice.
 */
@Injectable()
export class SurveillanceJobsService {
  private readonly logger = new Logger(SurveillanceJobsService.name);

  constructor(
    private readonly cases: SurveillanceService,
    private readonly weekly: WeeklyReturnService,
    private readonly email: EmailService,
    @InjectRepository(Facility)
    private readonly facilities: Repository<Facility>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WeeklyReturn)
    private readonly returns: Repository<WeeklyReturn>,
  ) {}

  // ── Who is told ─────────────────────────────────────────────────────────

  /** The facility's surveillance contact, else its active administrators. */
  async recipients(facilityId: string): Promise<string[]> {
    const facility = await this.facilities.findOne({
      where: { id: facilityId },
    });
    const contact = facility?.surveillanceEmail?.trim();
    if (contact) return [contact];
    const admins = await this.users.find({
      where: { facilityId, role: UserRole.FACILITY_ADMIN, isActive: true },
    });
    return [
      ...new Set(admins.map((u) => u.email).filter((e): e is string => !!e)),
    ];
  }

  private async tell(
    facilityId: string,
    subject: string,
    lines: string[],
  ): Promise<boolean> {
    const to = await this.recipients(facilityId);
    if (!to.length) {
      this.logger.warn(
        `No surveillance contact or administrator to email for facility ${facilityId}`,
      );
      return false;
    }
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${lines
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join(
        '',
      )}<p style="color:#666;font-size:12px">Sent by AfyaScribe disease surveillance. Patient details are kept in the system, behind sign-in, and are not included in this email.</p></div>`;
    let sent = false;
    for (const address of to) {
      try {
        await this.email.sendCustomEmail(address, subject, html);
        sent = true;
      } catch (err) {
        this.logger.error(
          `Surveillance email to ${address} failed: ${(err as Error).message}`,
        );
      }
    }
    return sent;
  }

  // ── D-3 / I-6: retry ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'idsr-resend', timeZone: TZ })
  async resendDue(
    now: Date = new Date(),
  ): Promise<{ cases: number; returns: number }> {
    const cases = await this.cases.dueForResend(now);
    for (const row of cases) {
      const saved = await this.cases.resend(row);
      if (saved.alertStatus === 'failed') await this.escalateCase(saved);
    }
    const returns = await this.weekly.dueForResend(now);
    for (const entity of returns) {
      const saved = await this.weekly.resend(entity);
      if (saved.submissionStatus === 'failed') await this.escalateReturn(saved);
    }
    return { cases: cases.length, returns: returns.length };
  }

  async escalateCase(row: DiseaseNotification): Promise<void> {
    if (row.alertEscalatedAt || (row.alertAttempts ?? 0) < ESCALATE_AFTER)
      return;
    const ok = await this.tell(
      row.facilityId,
      `Case notification not delivered: ${row.conditionName}`,
      [
        `A ${row.conditionName} case notified in AfyaScribe has failed to reach the surveillance endpoint ${row.alertAttempts} times. The last error was: ${row.alertError ?? 'unknown'}.`,
        'The system keeps trying, but please phone the case through to the sub-county disease surveillance coordinator now. Open AfyaScribe → Disease surveillance to see the case and print its MOH 502.',
      ],
    );
    if (ok) await this.cases.markReminded([row.id], 'alertEscalatedAt');
  }

  async escalateReturn(entity: WeeklyReturn): Promise<void> {
    if (
      entity.submissionEscalatedAt ||
      (entity.submissionAttempts ?? 0) < ESCALATE_AFTER
    )
      return;
    const ok = await this.tell(
      entity.facilityId,
      `MOH 505 for week ${entity.week} not delivered`,
      [
        `The weekly IDSR return for ${entity.year} week ${entity.week} has failed to reach the surveillance endpoint ${entity.submissionAttempts} times. The last error was: ${entity.submissionError ?? 'unknown'}.`,
        'The system keeps trying. Please send the return to the sub-county disease surveillance coordinator another way: open AfyaScribe → Disease surveillance → Weekly return and export or print it.',
      ],
    );
    if (ok)
      await this.returns.update(entity.id, {
        submissionEscalatedAt: new Date(),
      });
  }

  // ── D-8 / I-3: reminders ────────────────────────────────────────────────

  /** Immediate cases past 24 hours without a notification. One email per facility per run. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'idsr-overdue', timeZone: TZ })
  async remindOverdue(now: Date = new Date()): Promise<number> {
    const overdue = await this.cases.overdueUnreminded(now);
    const byFacility = new Map<string, DiseaseNotification[]>();
    for (const n of overdue)
      byFacility.set(n.facilityId, [
        ...(byFacility.get(n.facilityId) ?? []),
        n,
      ]);

    for (const [facilityId, rows] of byFacility) {
      const names = [...new Set(rows.map((r) => r.conditionName))].join(', ');
      const ok = await this.tell(
        facilityId,
        `${rows.length} suspected case${rows.length === 1 ? '' : 's'} overdue for notification`,
        [
          `${rows.length} suspected case${rows.length === 1 ? '' : 's'} of an immediately reportable disease (${names}) ${rows.length === 1 ? 'has' : 'have'} been waiting more than 24 hours without being notified.`,
          'IDSR requires notification to the sub-county within 24 hours of suspicion. Open AfyaScribe → Disease surveillance → Outstanding, and notify or dismiss each case.',
        ],
      );
      if (ok)
        await this.cases.markReminded(
          rows.map((r) => r.id),
          'overdueRemindedAt',
          now,
        );
    }
    return overdue.length;
  }

  /**
   * Monday, 08:00 Nairobi: for each active facility, raise last week's signals
   * and say what is outstanding — a return not yet submitted, and any signal
   * still open.
   */
  @Cron('0 8 * * 1', { name: 'idsr-monday', timeZone: TZ })
  async mondayReminders(today?: string): Promise<number> {
    const week = lastCompleteWeek(today);
    const tag = `${week.year}-W${String(week.week).padStart(2, '0')}`;
    const facilities = await this.facilities.find({
      where: { status: FacilityStatus.ACTIVE },
    });
    let told = 0;

    for (const facility of facilities) {
      if (facility.idsrRemindedWeek === tag) continue;
      try {
        const signals = (
          await this.weekly.raiseSignals(facility.id, week.year, week.week)
        ).filter((s) => s.status === 'open');
        const submitted = await this.returns.findOne({
          where: {
            facilityId: facility.id,
            year: week.year,
            week: week.week,
            status: 'submitted',
          },
        });

        const lines: string[] = [];
        if (!submitted) {
          lines.push(
            `The weekly IDSR return (MOH 505) for ${week.year} week ${week.week} (${week.start} to ${week.end}) has not been submitted. It is due today, Monday — zeros included, if there were no cases.`,
            'Open AfyaScribe → Disease surveillance → Weekly return, review the figures and submit.',
          );
        }
        if (signals.length) {
          lines.push(
            `${signals.length} public health signal${signals.length === 1 ? '' : 's'} for that week ${signals.length === 1 ? 'needs' : 'need'} looking at: ${signals
              .map((s) => `${s.conditionName} (${s.level})`)
              .join(', ')}.`,
            'Open AfyaScribe → Disease surveillance → Signals to acknowledge each one and record what was found.',
          );
        }
        if (
          lines.length &&
          (await this.tell(
            facility.id,
            `IDSR: week ${week.week} needs attention`,
            lines,
          ))
        ) {
          told += 1;
        }
        await this.facilities.update(facility.id, { idsrRemindedWeek: tag });
      } catch (err) {
        this.logger.error(
          `Monday IDSR reminder for facility ${facility.id} failed: ${(err as Error).message}`,
        );
      }
    }
    return told;
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
