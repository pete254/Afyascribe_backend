import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clinical services a provider orders and another department fulfils —
 * physiotherapy, occupational therapy, nutrition, social work, counselling.
 * They run as a course, so the order carries its sessions. Idempotent.
 */
export class AddClinicalServiceOrders1760700000000 implements MigrationInterface {
  name = 'AddClinicalServiceOrders1760700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clinical_service_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "patient_name" character varying(200),
        "visit_id" uuid,
        "discipline" character varying(40) NOT NULL,
        "service_id" uuid,
        "service_name" character varying(200),
        "knhts_code" character varying(64),
        "reason" text,
        "priority" character varying(20) NOT NULL DEFAULT 'routine',
        "status" character varying(20) NOT NULL DEFAULT 'requested',
        "scheduled_at" TIMESTAMP WITH TIME ZONE,
        "sessions_planned" integer,
        "sessions" jsonb NOT NULL DEFAULT '[]',
        "outcome" text,
        "ordered_by_id" uuid,
        "ordered_by_name" character varying(200),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "price" numeric(12,2),
        "billing_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinical_service_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cso_worklist" ON "clinical_service_orders" ("facility_id", "discipline", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cso_patient" ON "clinical_service_orders" ("facility_id", "patient_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "clinical_service_orders"`);
  }
}
