// src/app.module.ts — FINAL VERSION with all multi-facility modules
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SoapNotesModule } from './soap-notes/soap-notes.module';
import { PatientsModule } from './patients/patients.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { Icd10Module } from './icd10/icd10.module';
import { FacilitiesModule } from './facilities/facilities.module';

import { User } from './users/entities/user.entity';
import { SoapNote } from './soap-notes/entities/soap-note.entity';
import { Patient } from './patients/entities/patient.entity';
import { Facility } from './facilities/entities/facility.entity';
import { FacilityInviteCode } from './facilities/entities/facility-invite-code.entity';

import { KeepAliveService } from './services/keepAlive';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    HttpModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const config: any = {
          type: 'postgres',
          host: configService.get('DB_HOST'),
          port: Number(configService.get('DB_PORT')),
          username: configService.get('DB_USERNAME'),
          password: configService.get('DB_PASSWORD'),
          database: configService.get('DB_DATABASE'),
          entities: [User, SoapNote, Patient, Facility, FacilityInviteCode],
          autoLoadEntities: true,
          synchronize: !isProduction, // Never sync in production — run migrations manually
          logging: !isProduction,
        };
        if (isProduction) {
          config.ssl = { rejectUnauthorized: false };
          config.extra = { sslmode: 'require' };
        }
        return config;
      },
    }),

    UsersModule,
    AuthModule,
    SoapNotesModule,
    PatientsModule,
    TranscriptionModule,
    Icd10Module,
    FacilitiesModule,
  ],
  controllers: [AppController],
  providers: [AppService, KeepAliveService],
})
export class AppModule {}