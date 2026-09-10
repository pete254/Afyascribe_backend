import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { Icd11Service } from '../icd11.service';

/**
 * Seed script to populate ICD-11 codes
 * 
 * Run with: npm run seed:icd11
 * Or: ts-node src/seed-icd11.ts
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const icd11Service = app.get(Icd11Service);

  console.log('🌱 Starting ICD-11 database seeding...');
  
  try {
    await icd11Service.seedCommonCodes();
    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();