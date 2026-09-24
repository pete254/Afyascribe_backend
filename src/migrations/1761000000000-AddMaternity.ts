import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Antenatal and postnatal care: the pregnancy episode, its eight antenatal
 * contacts and its four postnatal ones. Idempotent.
 */
export class AddMaternity1761000000000 implements MigrationInterface {
  name = 'AddMaternity1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pregnancies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "anc_number" character varying(30),
        "lmp" date,
        "edd_entered" date,
        "ultrasound_date" date,
        "ultrasound_ga_days" integer,
        "gravida" integer,
        "para" integer,
        "living_children" integer,
        "risk_factors" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "profile_hb" numeric(4,1),
        "profile_blood_group" character varying(4),
        "profile_urinalysis" character varying(200),
        "profile_rbs" numeric(5,1),
        "profile_syphilis" character varying(20),
        "profile_hep_b" character varying(20),
        "profile_hiv" character varying(20),
        "profile_tb" character varying(20),
        "profile_date" date,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "outcome" character varying(30),
        "outcome_date" date,
        "delivery_mode" character varying(20),
        "place_of_birth" character varying(200),
        "babies_born" integer,
        "note" text,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pregnancies" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pregnancies_patient" ON "pregnancies" ("facility_id", "patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pregnancies_status" ON "pregnancies" ("facility_id", "status")`,
    );
    // One open pregnancy per woman: a second would silently split her contacts.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pregnancies_open" ON "pregnancies" ("facility_id", "patient_id") WHERE "status" = 'active'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "anc_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "pregnancy_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "visit_id" uuid,
        "contact_number" integer NOT NULL,
        "contact_date" date NOT NULL,
        "gestation_days" integer,
        "weight" numeric(5,2),
        "bp_systolic" integer,
        "bp_diastolic" integer,
        "pulse" integer,
        "temperature" numeric(4,1),
        "muac" numeric(4,1),
        "hb" numeric(4,1),
        "urine_protein" character varying(10),
        "urine_sugar" character varying(10),
        "fundal_height" integer,
        "fetal_heart_rate" integer,
        "presentation" character varying(20),
        "fetal_movement" boolean,
        "ifas_given" boolean NOT NULL DEFAULT false,
        "iptp_dose" integer,
        "deworming_given" boolean NOT NULL DEFAULT false,
        "llin_given" boolean NOT NULL DEFAULT false,
        "td_dose" integer,
        "aspirin_given" boolean NOT NULL DEFAULT false,
        "calcium_given" boolean NOT NULL DEFAULT false,
        "danger_signs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "referred" boolean NOT NULL DEFAULT false,
        "referred_to" character varying(200),
        "findings" text,
        "next_contact_date" date,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_anc_contacts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_anc_contacts_pregnancy" ON "anc_contacts" ("facility_id", "pregnancy_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_anc_contacts_date" ON "anc_contacts" ("facility_id", "contact_date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_anc_contacts_number" ON "anc_contacts" ("pregnancy_id", "contact_number")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pnc_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "pregnancy_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "baby_patient_id" uuid,
        "visit_id" uuid,
        "pnc_window" character varying(20) NOT NULL,
        "contact_date" date NOT NULL,
        "days_postpartum" integer,
        "bp_systolic" integer,
        "bp_diastolic" integer,
        "pulse" integer,
        "temperature" numeric(4,1),
        "hb" numeric(4,1),
        "uterine_involution" character varying(100),
        "lochia_amount" character varying(20),
        "lochia_offensive" boolean,
        "breast_findings" character varying(200),
        "perineum_findings" character varying(200),
        "maternal_danger_signs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "depression_q1" boolean,
        "depression_q2" boolean,
        "ipv_screen" character varying(20) NOT NULL DEFAULT 'not-asked',
        "fp_counselled" boolean NOT NULL DEFAULT false,
        "fp_method" character varying(100),
        "cervical_screening_offered" boolean NOT NULL DEFAULT false,
        "vitamin_a_given" boolean NOT NULL DEFAULT false,
        "baby_weight" numeric(5,3),
        "baby_temperature" numeric(4,1),
        "cord_condition" character varying(100),
        "feeding_method" character varying(30),
        "baby_danger_signs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "immunisation_up_to_date" boolean,
        "birth_notified" boolean NOT NULL DEFAULT false,
        "referred" boolean NOT NULL DEFAULT false,
        "referred_to" character varying(200),
        "findings" text,
        "next_contact_date" date,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pnc_contacts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pnc_contacts_pregnancy" ON "pnc_contacts" ("facility_id", "pregnancy_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pnc_contacts_date" ON "pnc_contacts" ("facility_id", "contact_date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pnc_contacts_window" ON "pnc_contacts" ("pregnancy_id", "pnc_window")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pnc_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "anc_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pregnancies"`);
  }
}
