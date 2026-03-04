// src/admin/admin.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/entities/user.entity';
import { Facility } from '../facilities/entities/facility.entity';

const AFYASCRIBE_FACILITY_CODE = 'AFY';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Facility)
    private readonly facilityRepository: Repository<Facility>,
    private readonly jwtService: JwtService,
  ) {}

  // ── Check if any super_admin exists ───────────────────────────────────────

  async superAdminExists(): Promise<boolean> {
    const count = await this.usersRepository.count({
      where: { role: UserRole.SUPER_ADMIN },
    });
    return count > 0;
  }

  // ── Get the Afyascribe system facility ────────────────────────────────────

  private async getAfyascribeFacility(): Promise<Facility> {
    const facility = await this.facilityRepository.findOne({
      where: { code: AFYASCRIBE_FACILITY_CODE },
    });

    if (!facility) {
      throw new NotFoundException(
        `Afyascribe facility (code: ${AFYASCRIBE_FACILITY_CODE}) not found. Ensure it exists in the database.`,
      );
    }

    return facility;
  }

  // ── Create the first super_admin (bootstrap only) ─────────────────────────

  async createSuperAdmin(data: {
    email: string;
    password: string; // already hashed
    firstName: string;
    lastName: string;
  }) {
    const existing = await this.usersRepository.findOne({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Link super admin to the existing Afyascribe facility
    const afyascribeFacility = await this.getAfyascribeFacility();

    const user = this.usersRepository.create({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.SUPER_ADMIN,
      facilityId: afyascribeFacility.id,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);

    // Return JWT so super_admin can log in immediately
    const payload = {
      sub: saved.id,
      email: saved.email,
      role: saved.role,
      firstName: saved.firstName,
      lastName: saved.lastName,
      facilityId: afyascribeFacility.id,
      facilityCode: afyascribeFacility.code,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: saved.id,
        email: saved.email,
        firstName: saved.firstName,
        lastName: saved.lastName,
        role: saved.role,
        facilityId: afyascribeFacility.id,
        facilityCode: afyascribeFacility.code,
        facilityName: afyascribeFacility.name,
      },
      message: 'super_admin created successfully. Remove BOOTSTRAP_SECRET from env to disable this endpoint.',
    };
  }

  // ── Create any user (super_admin use) ─────────────────────────────────────

  async createUser(data: {
    email: string;
    password: string; // already hashed
    firstName: string;
    lastName: string;
    role: UserRole;
    facilityId: string | null;
  }) {
    const existing = await this.usersRepository.findOne({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = this.usersRepository.create({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      facilityId: data.facilityId,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);

    // Return user without password
    const { password, ...result } = saved as any;
    return result;
  }

  // ── List users (filterable) ────────────────────────────────────────────────

  async listUsers(filters: { facilityId?: string; role?: string }) {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.facility', 'facility')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.role',
        'user.facilityId',
        'user.isActive',
        'user.isDeactivated',
        'user.createdAt',
        'facility.id',
        'facility.name',
        'facility.code',
      ])
      .orderBy('user.createdAt', 'DESC');

    if (filters.facilityId) {
      qb.andWhere('user.facilityId = :facilityId', { facilityId: filters.facilityId });
    }

    if (filters.role) {
      qb.andWhere('user.role = :role', { role: filters.role });
    }

    return qb.getMany();
  }

  // ── Get single user ────────────────────────────────────────────────────────

  async getUserById(id: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.facility', 'facility')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.role',
        'user.facilityId',
        'user.isActive',
        'user.isDeactivated',
        'user.createdAt',
        'facility.id',
        'facility.name',
        'facility.code',
      ])
      .where('user.id = :id', { id })
      .getOne();

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}