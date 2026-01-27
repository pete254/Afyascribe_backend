// src/app.module.ts - ALTERNATIVE VERSION WITH ENHANCED SSL CONFIG
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

import { User } from './users/entities/user.entity';
import { SoapNote } from './soap-notes/entities/soap-note.entity';
import { Patient } from './patients/entities/patient.entity';

import { KeepAliveService } from './services/keepAlive';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    HttpModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const dbUrl = configService.get('DATABASE_URL'); // If using DATABASE_URL instead

        console.log('🔌 Database Configuration:');
        console.log('- Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
        console.log('- Host:', configService.get('DB_HOST'));
        console.log('- Port:', configService.get('DB_PORT'));
        console.log('- Database:', configService.get('DB_DATABASE'));
        console.log('- SSL Enabled:', isProduction);

        // Option 1: Using individual connection parameters
        if (!dbUrl) {
          return {
            type: 'postgres',
            host: configService.get('DB_HOST'),
            port: Number(configService.get('DB_PORT')) || 5432,
            username: configService.get('DB_USERNAME'),
            password: configService.get('DB_PASSWORD'),
            database: configService.get('DB_DATABASE'),
            entities: [User, SoapNote, Patient],
            autoLoadEntities: true,
            synchronize: !isProduction,
            logging: !isProduction,
            
            // ✅ CRITICAL: SSL must be enabled AND properly configured
            ssl: isProduction ? true : false,
            extra: isProduction
              ? {
                  ssl: {
                    rejectUnauthorized: false,
                  },
                  // Additional connection settings for stability
                  connectionTimeoutMillis: 10000,
                  idleTimeoutMillis: 30000,
                  max: 20, // Maximum pool size
                }
              : {},
          };
        }

        // Option 2: Using DATABASE_URL (if available)
        return {
          type: 'postgres',
          url: dbUrl,
          entities: [User, SoapNote, Patient],
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: !isProduction,
          
          // ✅ SSL configuration for DATABASE_URL
          ssl: isProduction ? true : false,
          extra: isProduction
            ? {
                ssl: {
                  rejectUnauthorized: false,
                },
                connectionTimeoutMillis: 10000,
                idleTimeoutMillis: 30000,
                max: 20,
              }
            : {},
        };
      },
    }),

    UsersModule,
    AuthModule,
    SoapNotesModule,
    PatientsModule,
    TranscriptionModule,
    Icd10Module,
  ],
  controllers: [AppController],
  providers: [AppService, KeepAliveService],
})
export class AppModule {}