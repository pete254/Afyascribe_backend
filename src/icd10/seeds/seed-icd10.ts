import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Icd10Code } from '../entities/icd10-code.entity';
import { COMMON_ICD10_CODES } from './common-icd10-codes.seed';

@Injectable()
export class Icd10SeederService {
  private readonly logger = new Logger(Icd10SeederService.name);

  constructor(
    @InjectRepository(Icd10Code)
    private icd10Repository: Repository<Icd10Code>,
  ) {}

  async seedCommonCodes(): Promise<void> {
    this.logger.log('🌱 Seeding common ICD-10 codes...');

    let seeded = 0;
    let skipped = 0;

    for (const codeData of COMMON_ICD10_CODES) {
      const existing = await this.icd10Repository.findOne({
        where: { code: codeData.code },
      });

      if (!existing) {
        await this.icd10Repository.save(codeData);
        seeded++;
      } else {
        skipped++;
      }
    }

    this.logger.log(`✅ Seeding complete: ${seeded} new codes, ${skipped} skipped`);
  }
}