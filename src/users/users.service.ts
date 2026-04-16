// src/users/users.service.ts
// UPDATED: create() now accepts optional isOwner flag
import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(createUserDto: CreateUserDto & { isOwner?: boolean }): Promise<User> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const user: User = this.usersRepository.create({
      email: createUserDto.email,
      password: createUserDto.password,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      role: createUserDto.role,
      facilityId: createUserDto.facilityId ?? null,
      // isOwner is stored if the column exists (migration has been run)
      ...(createUserDto.isOwner !== undefined ? { isOwner: createUserDto.isOwner } : {}),
    });

    return this.usersRepository.save(user);
  }

  // ── FIND METHODS ───────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByEmailWithFacility(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      relations: ['facility'],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    if (user.isDeactivated) throw new UnauthorizedException('Account has been deactivated');
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Get all users belonging to a specific facility.
   * Used by facility_admin / owner-doctor to list and manage their staff.
   */
  async findByFacility(facilityId: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersRepository.find({
      where: { facilityId },
      order: { lastName: 'ASC', firstName: 'ASC' },
      select: [
        'id', 'email', 'firstName', 'lastName', 'role',
        'isActive', 'isDeactivated', 'deactivatedAt',
        'deactivationReason', 'createdAt', 'updatedAt',
      ],
    });
    return users;
  }

  // ── PASSWORD RESET ─────────────────────────────────────────────────────────

  async setResetCode(userId: string, code: string, expiresAt: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      resetCode: code,
      resetCodeExpiresAt: expiresAt,
      resetCodeAttempts: 0,
    });
  }

  async incrementResetCodeAttempts(userId: string): Promise<number> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.resetCodeAttempts += 1;
    await this.usersRepository.save(user);
    return user.resetCodeAttempts;
  }

  async clearResetCode(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      resetCode: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(userId, { password: hashedPassword });
  }

  // ── OLD TOKEN-BASED RESET ──────────────────────────────────────────────────

  async setResetPasswordToken(email: string, token: string, expiresAt: Date): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    await this.usersRepository.save(user);
  }

  async findByResetToken(token: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });
    if (user?.resetPasswordExpires && user.resetPasswordExpires < new Date()) return null;
    return user ?? null;
  }

  async clearResetToken(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  }

  // ── DEACTIVATION ───────────────────────────────────────────────────────────

  async deactivateAccount(userId: string, reason?: string): Promise<void> {
    await this.usersRepository.update(userId, {
      isDeactivated: true,
      deactivatedAt: new Date(),
      deactivationReason: reason ?? null,
    });
  }

  async reactivateAccount(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      isDeactivated: false,
      deactivatedAt: null,
      deactivationReason: null,
    });
  }
}