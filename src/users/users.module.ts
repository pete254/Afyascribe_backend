// src/users/users.module.ts - UPDATED
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller'; // ✅ ADD THIS
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController], // ✅ ADD THIS
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}