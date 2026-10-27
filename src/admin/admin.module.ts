// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { jwtModuleOptions } from '../auth/jwt-keys';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Facility]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        jwtModuleOptions(configService, configService.get<string>('JWT_EXPIRES_IN', '7d')),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}