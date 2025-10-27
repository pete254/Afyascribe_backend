// src/users/users.service.ts - UPDATED WITH 6-DIGIT CODE METHODS
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
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

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const user = this.usersRepository.create(createUserDto);
    return await this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  // ✅ OLD TOKEN-BASED METHODS (kept for backward compatibility)
  async setResetPasswordToken(email: string, token: string, expiresAt: Date): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    await this.usersRepository.save(user);
  }

  async findByResetToken(token: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });

    if (user && user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      return null;
    }

    return user;
  }

  async clearResetToken(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  }

  // ✅ NEW: 6-DIGIT CODE METHODS
  async setResetCode(email: string, code: string, expiresAt: Date): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.resetCode = code;
    user.resetCodeExpiresAt = expiresAt;
    user.resetCodeAttempts = 0; // Reset attempts when new code is generated
    await this.usersRepository.save(user);
  }

  async findByEmailWithResetCode(email: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { email },
    });

    if (!user || !user.resetCode || !user.resetCodeExpiresAt) {
      return null;
    }

    // Check if code expired
    if (user.resetCodeExpiresAt < new Date()) {
      return null;
    }

    return user;
  }

  async incrementResetCodeAttempts(userId: string): Promise<number> {
    const user = await this.findById(userId);
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
    await this.usersRepository.update(userId, {
      password: hashedPassword,
    });
  }
}