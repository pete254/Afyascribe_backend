import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Immunisation } from './entities/immunisation.entity';
import { RecordDoseDto } from './dto/immunisation.dto';
import { DoseStatus, doseStatuses } from './due';
import { SCHEDULE_SOURCE, maternalSchedule, subnationalSchedule, vaccineLabel } from './data/schedule';
import { Patient } from '../patients/entities/patient.entity';
import { CurrentUserType } from '../common/decorators/current-user.decorator';

export interface ImmunisationCard {
  patientId: string;
  dateOfBirth: string | null;
  /** WHO's provenance travels with the answer, so the schedule's age is visible. */
  source: typeof SCHEDULE_SOURCE;
  doses: DoseStatus[];
  given: Immunisation[];
  overdue: number;
  dueNow: number;
  /** Vaccines given only in certain counties — offered, never assumed. */
  subnational: { vaccine: string; vaccineLabel: string; dose: number; age: string | null }[];
}

@Injectable()
export class ImmunisationService {
  constructor(
    @InjectRepository(Immunisation) private readonly doses: Repository<Immunisation>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  private fullName(u?: CurrentUserType): string | null {
    if (!u) return null;
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null;
  }

  /** A child's immunisation card: what is given, due and overdue. */
  async card(facilityId: string, patientId: string): Promise<ImmunisationCard> {
    const patient = await this.patients.findOne({ where: { id: patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const given = await this.doses.find({
      where: { facilityId, patientId },
      order: { givenDate: 'ASC' },
    });

    const statuses = patient.dateOfBirth
      ? doseStatuses(
          patient.dateOfBirth,
          given.map((g) => ({ vaccine: g.vaccine, dose: g.dose, givenDate: g.givenDate })),
          { sex: patient.gender },
        )
      : [];

    return {
      patientId,
      dateOfBirth: patient.dateOfBirth ?? null,
      source: SCHEDULE_SOURCE,
      doses: statuses,
      given,
      overdue: statuses.filter((d) => d.state === 'overdue').length,
      dueNow: statuses.filter((d) => d.state === 'due').length,
      subnational: subnationalSchedule().map((r) => ({
        vaccine: r.vaccine,
        vaccineLabel: vaccineLabel(r.vaccine),
        dose: r.dose,
        age: r.age,
      })),
    };
  }

  async record(facilityId: string, dto: RecordDoseDto, user?: CurrentUserType): Promise<Immunisation> {
    const patient = await this.patients.findOne({ where: { id: dto.patientId, facilityId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (patient.dateOfBirth && dto.givenDate < patient.dateOfBirth) {
      throw new BadRequestException('A dose cannot be given before the patient was born');
    }
    if (dto.givenDate > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('A dose cannot be recorded as given in the future');
    }

    const existing = await this.doses.findOne({
      where: { facilityId, patientId: dto.patientId, vaccine: dto.vaccine, dose: dto.dose },
    });
    if (existing) {
      throw new BadRequestException(
        `${vaccineLabel(dto.vaccine)} dose ${dto.dose} is already recorded for this patient`,
      );
    }

    return this.doses.save(
      this.doses.create({
        facilityId,
        patientId: dto.patientId,
        vaccine: dto.vaccine,
        dose: dto.dose,
        givenDate: dto.givenDate,
        givenHere: dto.givenHere ?? true,
        batchNo: dto.batchNo?.trim() || null,
        expiryDate: dto.expiryDate ?? null,
        site: dto.site?.trim() || null,
        note: dto.note?.trim() || null,
        givenById: user?.id ?? null,
        givenByName: this.fullName(user),
      }),
    );
  }

  async remove(facilityId: string, id: string): Promise<void> {
    const row = await this.doses.findOne({ where: { id, facilityId } });
    if (!row) throw new NotFoundException('Dose not found');
    await this.doses.remove(row);
  }

  /** The maternal schedule, for a pregnant woman rather than a child. */
  maternal() {
    return {
      source: SCHEDULE_SOURCE,
      doses: maternalSchedule().map((r) => ({
        vaccine: r.vaccine,
        vaccineLabel: vaccineLabel(r.vaccine),
        dose: r.dose,
        age: r.age,
      })),
    };
  }
}
