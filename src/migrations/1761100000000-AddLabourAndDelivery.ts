import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Labour and delivery: the MOH 333 register, and the labour chart underneath
 * the WHO Labour Care Guide. Idempotent.
 */
export class AddLabourAndDelivery1761100000000 implements MigrationInterface {
  name = 'AddLabourAndDelivery1761100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "pregnancy_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "visit_id" uuid,
        "admitted_at" TIMESTAMP WITH TIME ZONE,
        "referred_in" boolean NOT NULL DEFAULT false,
        "referred_from" character varying(200),
        "labour_onset" character varying(20),
        "labour_onset_at" TIMESTAMP WITH TIME ZONE,
        "active_labour_at" TIMESTAMP WITH TIME ZONE,
        "membranes_ruptured_at" TIMESTAMP WITH TIME ZONE,
        "risk_factors" text,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "delivery_mode" character varying(20),
        "gestation_weeks" integer,
        "perineum" character varying(20),
        "perineum_repaired" boolean,
        "amtsl_given" boolean NOT NULL DEFAULT false,
        "blood_loss_ml" integer,
        "placenta_complete" boolean,
        "complications" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "conducted_by_name" character varying(200),
        "maternal_outcome" character varying(20),
        "maternal_discharged_at" TIMESTAMP WITH TIME ZONE,
        "maternal_death_cause" character varying(300),
        "notes" text,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deliveries_pregnancy" ON "deliveries" ("facility_id", "pregnancy_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deliveries_date" ON "deliveries" ("facility_id", "delivered_at")`,
    );
    // One labour record per pregnancy — a second would split the chart in two.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deliveries_pregnancy" ON "deliveries" ("pregnancy_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "births" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "delivery_id" uuid NOT NULL,
        "pregnancy_id" uuid NOT NULL,
        "mother_patient_id" uuid NOT NULL,
        "baby_patient_id" uuid,
        "birth_order" integer NOT NULL DEFAULT 1,
        "born_at" TIMESTAMP WITH TIME ZONE,
        "outcome" character varying(30) NOT NULL,
        "sex" character varying(20),
        "birth_weight_grams" integer,
        "apgar_1" integer,
        "apgar_5" integer,
        "apgar_10" integer,
        "resuscitated" boolean NOT NULL DEFAULT false,
        "breastfed_within_hour" boolean,
        "chlorhexidine_cord_care" boolean NOT NULL DEFAULT false,
        "vitamin_k_given" boolean NOT NULL DEFAULT false,
        "eye_prophylaxis_given" boolean NOT NULL DEFAULT false,
        "congenital_anomaly" character varying(300),
        "discharge_status" character varying(20),
        "discharged_at" TIMESTAMP WITH TIME ZONE,
        "referred_to" character varying(200),
        "birth_notified" boolean NOT NULL DEFAULT false,
        "birth_notification_no" character varying(60),
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_births" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_births_delivery" ON "births" ("facility_id", "delivery_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_births_date" ON "births" ("facility_id", "born_at")`,
    );
    // Twins are two rows; the same twin twice is a slip.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_births_order" ON "births" ("delivery_id", "birth_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "labour_observations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "delivery_id" uuid NOT NULL,
        "observed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "companion" character varying(4),
        "pain_relief" character varying(4),
        "oral_fluid" character varying(4),
        "posture" character varying(4),
        "baseline_fhr" integer,
        "fhr_deceleration" character varying(4),
        "amniotic_fluid" character varying(6),
        "fetal_position" character varying(4),
        "caput" character varying(4),
        "moulding" character varying(4),
        "pulse" integer,
        "systolic" integer,
        "diastolic" integer,
        "temperature" numeric(4,1),
        "urine" character varying(6),
        "contractions_per_10" integer,
        "contraction_duration" integer,
        "cervix" numeric(3,1),
        "descent" integer,
        "oxytocin" character varying(100),
        "medicine" character varying(200),
        "iv_fluids" character varying(200),
        "assessment" text,
        "plan" text,
        "alerts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labour_observations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_labour_observations_delivery" ON "labour_observations" ("facility_id", "delivery_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "labour_observations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "births"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deliveries"`);
  }
}
