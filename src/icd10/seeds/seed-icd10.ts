import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { Icd10Service } from '../icd10.service';

/**
 * Seed script to populate ICD-10 codes
 * 
 * Run with: npm run seed:icd10
 * Or: ts-node src/seed-icd10.ts
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const icd10Service = app.get(Icd10Service);

  console.log('🌱 Starting ICD-10 database seeding...');
  
  try {
    await icd10Service.seedCommonCodes();
    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();