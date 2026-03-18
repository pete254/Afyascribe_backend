import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Billing, BillingStatus, PaymentMode } from '../billing/entities/billing.entity';
import { PatientVisit, VisitStatus } from '../patient-visits/entities/patient-visit.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Billing)
    private readonly billingRepo: Repository<Billing>,
    @InjectRepository(PatientVisit)
    private readonly visitsRepo: Repository<PatientVisit>,
  ) {}

  // ── PATIENTS TODAY ─────────────────────────────────────────────────────────
  async getPatientsToday(facilityId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const visits = await this.visitsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.patient', 'patient')
      .leftJoinAndSelect('v.assignedDoctor', 'doctor')
      .leftJoinAndSelect('v.checkedInBy', 'checkedInBy')
      .where('v.facility_id = :facilityId', { facilityId })
      .andWhere('v.created_at >= :today', { today })
      .andWhere('v.created_at < :tomorrow', { tomorrow })
      .orderBy('v.created_at', 'ASC')
      .getMany();

    const total = visits.length;
    const byStatus = {
      checked_in: visits.filter(v => v.status === VisitStatus.CHECKED_IN).length,
      triage: visits.filter(v => v.status === VisitStatus.TRIAGE).length,
      waiting_for_doctor: visits.filter(v => v.status === VisitStatus.WAITING_FOR_DOCTOR).length,
      with_doctor: visits.filter(v => v.status === VisitStatus.WITH_DOCTOR).length,
      completed: visits.filter(v => v.status === VisitStatus.COMPLETED).length,
      cancelled: visits.filter(v => v.status === VisitStatus.CANCELLED).length,
    };

    return { total, byStatus, visits };
  }

  // ── FINANCIAL REPORT ───────────────────────────────────────────────────────
  async getFinancialReport(
    facilityId: string,
    from: Date,
    to: Date,
  ) {
    const toEndOfDay = new Date(to);
    toEndOfDay.setHours(23, 59, 59, 999);

    const bills = await this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .leftJoinAndSelect('b.collectedBy', 'collectedBy')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEndOfDay })
      .orderBy('b.created_at', 'DESC')
      .getMany();

    const totalBilled = bills.reduce((s, b) => s + Number(b.amount), 0);
    const totalCollected = bills
      .filter(b => b.status === BillingStatus.PAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalWaived = bills
      .filter(b => b.status === BillingStatus.WAIVED)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalOutstanding = bills
      .filter(b => b.status === BillingStatus.UNPAID)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalInsurancePending = bills
      .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
      .reduce((s, b) => s + Number(b.amount), 0);

    // Breakdown by service type
    const serviceTypes = [...new Set(bills.map(b => b.serviceType))];
    const byServiceType = serviceTypes.map(type => {
      const typeBills = bills.filter(b => b.serviceType === type);
      return {
        type,
        count: typeBills.length,
        total: typeBills.reduce((s, b) => s + Number(b.amount), 0),
        collected: typeBills
          .filter(b => b.status === BillingStatus.PAID)
          .reduce((s, b) => s + Number(b.amount), 0),
      };
    });

    // Breakdown by payment method
    const byPaymentMethod = ['cash', 'mpesa', 'card'].map(method => ({
      method,
      count: bills.filter(b => b.paymentMethod === method).length,
      total: bills
        .filter(b => b.paymentMethod === method)
        .reduce((s, b) => s + Number(b.amount), 0),
    }));

    return {
      period: { from, to: toEndOfDay },
      summary: {
        totalBilled,
        totalCollected,
        totalWaived,
        totalOutstanding,
        totalInsurancePending,
        transactionCount: bills.length,
      },
      byServiceType,
      byPaymentMethod,
      bills,
    };
  }

  // ── INSURANCE CLAIMS REPORT ────────────────────────────────────────────────
  async getInsuranceClaims(
    facilityId: string,
    from: Date,
    to: Date,
    insuranceSchemeName?: string,
  ) {
    const toEndOfDay = new Date(to);
    toEndOfDay.setHours(23, 59, 59, 999);

    const qb = this.billingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.patient', 'patient')
      .leftJoinAndSelect('b.visit', 'visit')
      .where('b.facility_id = :facilityId', { facilityId })
      .andWhere('b.payment_mode IN (:...modes)', {
        modes: [PaymentMode.INSURANCE, PaymentMode.SPLIT],
      })
      .andWhere('b.created_at >= :from', { from })
      .andWhere('b.created_at <= :to', { to: toEndOfDay })
      .orderBy('b.created_at', 'DESC');

    if (insuranceSchemeName) {
      qb.andWhere('b.insurance_scheme_name = :scheme', {
        scheme: insuranceSchemeName,
      });
    }

    const claims = await qb.getMany();

    const totalClaimed = claims.reduce((s, b) => s + Number(b.amount), 0);
    const totalPending = claims
      .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
      .reduce((s, b) => s + Number(b.amount), 0);
    const totalSettled = claims
      .filter(b => b.status === BillingStatus.PAID)
      .reduce((s, b) => s + Number(b.amount), 0);

    // Group by insurer
    const schemeNames = [...new Set(claims.map(b => b.insuranceSchemeName).filter(Boolean))];
    const byScheme = schemeNames.map(scheme => {
      const schemeBills = claims.filter(b => b.insuranceSchemeName === scheme);
      return {
        scheme,
        count: schemeBills.length,
        total: schemeBills.reduce((s, b) => s + Number(b.amount), 0),
        pending: schemeBills
          .filter(b => b.status === BillingStatus.INSURANCE_PENDING)
          .reduce((s, b) => s + Number(b.amount), 0),
      };
    });

    return {
      period: { from, to: toEndOfDay },
      summary: { totalClaimed, totalPending, totalSettled, claimCount: claims.length },
      byScheme,
      claims,
    };
  }

  // ── CSV EXPORT ─────────────────────────────────────────────────────────────
  async getInsuranceClaimsCsv(
    facilityId: string,
    from: Date,
    to: Date,
    insuranceSchemeName?: string,
  ): Promise<string> {
    const report = await this.getInsuranceClaims(facilityId, from, to, insuranceSchemeName);

    const header = [
      'Date', 'Patient Name', 'Patient ID', 'Membership No',
      'Insurance Scheme', 'Service Type', 'Service Description',
      'Amount (KES)', 'Status', 'Payment Mode',
    ].join(',');

    const rows = report.claims.map(b => {
      const date = new Date(b.createdAt).toLocaleDateString('en-KE');
      const name = `${b.patient?.firstName ?? ''} ${b.patient?.lastName ?? ''}`.trim();
      const patientId = b.patient?.patientId ?? '';
      const membershipNo = b.patient?.membershipNo ?? '';
      const scheme = b.insuranceSchemeName ?? '';
      const serviceType = b.serviceType;
      const desc = (b.serviceDescription ?? '').replace(/,/g, ';');
      const amount = Number(b.amount).toFixed(2);
      const status = b.status;
      const mode = b.paymentMode;
      return [date, name, patientId, membershipNo, scheme, serviceType, desc, amount, status, mode].join(',');
    });

    return [header, ...rows].join('\n');
  }
}