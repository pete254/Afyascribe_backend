import { MigrationInterface, QueryRunner } from 'typeorm';

/** Supplier address and bank details, for records and remittances. */
export class SupplierDetails1717200000000 implements MigrationInterface {
  name = 'SupplierDetails1717200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'physical_address',
      'postal_address',
      'bank_name',
      'bank_account',
      'bank_branch',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "${col}" character varying`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'bank_branch',
      'bank_account',
      'bank_name',
      'postal_address',
      'physical_address',
    ]) {
      await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
