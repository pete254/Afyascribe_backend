import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { MedicationAdministration } from './entities/medication-administration.entity';
import { Prescription } from '../prescriptions/entities/prescription.entity';
import { Admission } from '../inpatient/entities/admission.entity';
import { Patient } from '../patients/entities/patient.entity';
import { RecordAdministrationDto } from './dto/kardex.dto';

/** A single drug order on the kardex, distilled from the doctor's prescriptions. */
export interface KardexOrder {
  prescriptionId: string;
  prescriptionItemId: string;
  rxNo: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  doctorName: string | null;
  prescribedAt: Date;
  status: string;
  /** How many times this line has been given/handled on the kardex. */
  administeredCount: number;
  lastAdministeredAt: Date | null;
}

export interface KardexPatient {
  id: string;
  patientNo: string;
  name: string;
  gender: string | null;
  age: number | null;
}

@Injectable()
export class KardexService {
  constructor(
    @InjectRepository(MedicationAdministration)
    private readonly marRepo: Repository<MedicationAdministration>,
    @InjectRepository(Prescription)
    private readonly rxRepo: Repository<Prescription>,
    @InjectRepository(Admission)
    private readonly admRepo: Repository<Admission>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  private fullName(p: Patient): string {
    return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim();
  }

  /**
   * The full medication kardex for a patient: their identity, the doctor's drug
   * orders (from every non-cancelled prescription) and the running record of
   * every administration the nurses have signed for.
   */
  async patientKardex(facilityId: string, patientId: string) {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient || (patient.facilityId && patient.facilityId !== facilityId)) {
      throw new NotFoundException('Patient not found');
    }

    // Drug orders — flatten every line of every prescription that isn't cancelled.
    const prescriptions = await this.rxRepo.find({
      where: { facilityId, patientId, status: Not('cancelled') },
      order: { createdAt: 'DESC' },
    });

    // Administrations already recorded for this patient.
    const administrations = await this.marRepo.find({
      where: { facilityId, patientId },
      order: { administeredAt: 'DESC' },
    });

    const byItem = new Map<string, MedicationAdministration[]>();
    for (const a of administrations) {
      if (!a.prescriptionItemId) continue;
      const list = byItem.get(a.prescriptionItemId) ?? [];
      list.push(a);
      byItem.set(a.prescriptionItemId, list);
    }

    const orders: KardexOrder[] = [];
    for (const rx of prescriptions) {
      for (const item of rx.items ?? []) {
        const given = byItem.get(item.id) ?? [];
        orders.push({
          prescriptionId: rx.id,
          prescriptionItemId: item.id,
          rxNo: rx.rxNo ?? null,
          medication: item.medication,
          dosage: item.dosage ?? null,
          frequency: item.frequency ?? null,
          duration: item.duration ?? null,
          instructions: item.instructions ?? null,
          doctorName: rx.doctorName ?? null,
          prescribedAt: rx.createdAt,
          status: rx.status,
          administeredCount: given.length,
          lastAdministeredAt: given.length ? given[0].administeredAt : null,
        });
      }
    }

    const kardexPatient: KardexPatient = {
      id: patient.id,
      patientNo: patient.patientId,
      name: this.fullName(patient),
      gender: patient.gender ?? null,
      age: patient.age ?? null,
    };

    return { patient: kardexPatient, orders, administrations };
  }

  /** Kardex anchored on an inpatient admission (the bedside view). */
  async admissionKardex(facilityId: string, admissionId: string) {
    const admission = await this.admRepo.findOne({ where: { id: admissionId, facilityId } });
    if (!admission) throw new NotFoundException('Admission not found');
    const kardex = await this.patientKardex(facilityId, admission.patientId);
    return { admission, ...kardex };
  }

  /** Record one administration event, signed by the acting nurse. */
  async record(
    facilityId: string,
    dto: RecordAdministrationDto,
    userId: string,
    userName: string,
  ) {
    const patient = await this.patientRepo.findOne({ where: { id: dto.patientId } });
    if (!patient || (patient.facilityId && patient.facilityId !== facilityId)) {
      throw new NotFoundException('Patient not found');
    }
    if (dto.admissionId) {
      const adm = await this.admRepo.findOne({ where: { id: dto.admissionId, facilityId } });
      if (!adm) throw new BadRequestException('Admission not found');
    }

    const entry = this.marRepo.create({
      facilityId,
      patientId: dto.patientId,
      admissionId: dto.admissionId ?? null,
      prescriptionId: dto.prescriptionId ?? null,
      prescriptionItemId: dto.prescriptionItemId ?? null,
      medication: dto.medication.trim(),
      dose: dto.dose?.trim() || null,
      route: dto.route?.trim() || null,
      frequency: dto.frequency?.trim() || null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : new Date(),
      status: dto.status,
      administeredById: userId,
      administeredByName: userName || null,
      notes: dto.notes?.trim() || null,
    });
    return this.marRepo.save(entry);
  }

  /**
   * A compact list of currently-admitted patients that have a kardex worth
   * opening — used to seed a nurse's ward round list.
   */
  async activeAdmissionsWithKardex(facilityId: string) {
    const admissions = await this.admRepo.find({
      where: { facilityId, status: 'admitted' },
      order: { admittedAt: 'DESC' },
    });
    if (admissions.length === 0) return [];

    const patientIds = [...new Set(admissions.map((a) => a.patientId))];
    const patients = await this.patientRepo.find({ where: { id: In(patientIds) } });
    const nameById = new Map(patients.map((p) => [p.id, this.fullName(p)]));
    const noById = new Map(patients.map((p) => [p.id, p.patientId]));

    // Count active drug orders per patient for the badge.
    const prescriptions = await this.rxRepo.find({
      where: { facilityId, patientId: In(patientIds), status: Not('cancelled') },
    });
    const orderCount = new Map<string, number>();
    for (const rx of prescriptions) {
      orderCount.set(rx.patientId, (orderCount.get(rx.patientId) ?? 0) + (rx.items?.length ?? 0));
    }

    return admissions.map((a) => ({
      admissionId: a.id,
      admissionNo: a.admissionNo,
      patientId: a.patientId,
      patientName: nameById.get(a.patientId) ?? 'Unknown',
      patientNo: noById.get(a.patientId) ?? null,
      wardId: a.wardId,
      bedId: a.bedId,
      admittedAt: a.admittedAt,
      orderCount: orderCount.get(a.patientId) ?? 0,
    }));
  }
}
