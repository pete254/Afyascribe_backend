import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  BIRTH_OUTCOMES,
  DELIVERY_MODES,
  DISCHARGE_STATUSES,
  LABOUR_ONSETS,
  PERINEUM_STATES,
} from '../maternity.enums';

export class OpenDeliveryDto {
  @ApiProperty() @IsUUID() pregnancyId: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() admittedAt?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() referredIn?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() referredFrom?: string;

  @ApiPropertyOptional({ enum: LABOUR_ONSETS })
  @IsIn(LABOUR_ONSETS) @IsOptional() labourOnset?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() labourOnsetAt?: string;

  @ApiPropertyOptional({ description: "When active first stage was diagnosed — the guide's clock" })
  @IsDateString() @IsOptional() activeLabourAt?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() membranesRupturedAt?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() riskFactors?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;
}

export class UpdateDeliveryDto extends OpenDeliveryDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() deliveredAt?: string;

  @ApiPropertyOptional({ enum: DELIVERY_MODES })
  @IsIn(DELIVERY_MODES) @IsOptional() deliveryMode?: string;

  @ApiPropertyOptional() @IsInt() @Min(20) @Max(45) @IsOptional() gestationWeeks?: number;

  @ApiPropertyOptional({ enum: PERINEUM_STATES })
  @IsIn(PERINEUM_STATES) @IsOptional() perineum?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() perineumRepaired?: boolean;

  @ApiPropertyOptional({ description: 'Active management of the third stage' })
  @IsBoolean() @IsOptional() amtslGiven?: boolean;

  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10000) @IsOptional() bloodLossMl?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() placentaComplete?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() complications?: string[];

  @ApiPropertyOptional() @IsString() @IsOptional() conductedByName?: string;

  @ApiPropertyOptional({ enum: DISCHARGE_STATUSES })
  @IsIn(DISCHARGE_STATUSES) @IsOptional() maternalOutcome?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() maternalDischargedAt?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() maternalDeathCause?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class BirthDto {
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(6) @IsOptional() birthOrder?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() bornAt?: string;

  @ApiProperty({ enum: BIRTH_OUTCOMES })
  @IsIn(BIRTH_OUTCOMES) outcome: string;

  @ApiPropertyOptional({ example: 'female' })
  @IsString() @IsOptional() sex?: string;

  @ApiPropertyOptional({ description: 'Birth weight in grams' })
  @IsInt() @Min(100) @Max(8000) @IsOptional() birthWeightGrams?: number;

  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10) @IsOptional() apgar1?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10) @IsOptional() apgar5?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(10) @IsOptional() apgar10?: number;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() resuscitated?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() breastfedWithinHour?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() chlorhexidineCordCare?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() vitaminKGiven?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() eyeProphylaxisGiven?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() congenitalAnomaly?: string;

  @ApiPropertyOptional({ enum: DISCHARGE_STATUSES })
  @IsIn(DISCHARGE_STATUSES) @IsOptional() dischargeStatus?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() dischargedAt?: string;
  @ApiPropertyOptional({ description: 'Where the baby was sent, which the paper register loses' })
  @IsString() @IsOptional() referredTo?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() birthNotified?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() birthNotificationNo?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() babyPatientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

/** One column of the labour chart. Every field is optional: a midwife records
 *  what she took, and a blank stays blank rather than becoming a normal value. */
export class LabourObservationDto {
  @ApiProperty() @IsDateString() observedAt: string;

  @ApiPropertyOptional({ enum: ['Y', 'N', 'D', 'U'] })
  @IsString() @IsOptional() companion?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() painRelief?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() oralFluid?: string;
  @ApiPropertyOptional({ enum: ['MO', 'SP'] }) @IsString() @IsOptional() posture?: string;

  @ApiPropertyOptional() @IsInt() @Min(30) @Max(300) @IsOptional() baselineFhr?: number;
  @ApiPropertyOptional({ enum: ['N', 'E', 'L', 'V'] }) @IsString() @IsOptional() fhrDeceleration?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() amnioticFluid?: string;
  @ApiPropertyOptional({ enum: ['A', 'P', 'T'] }) @IsString() @IsOptional() fetalPosition?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() caput?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() moulding?: string;

  @ApiPropertyOptional() @IsInt() @Min(20) @Max(250) @IsOptional() pulse?: number;
  @ApiPropertyOptional() @IsInt() @Min(40) @Max(300) @IsOptional() systolic?: number;
  @ApiPropertyOptional() @IsInt() @Min(20) @Max(200) @IsOptional() diastolic?: number;
  @ApiPropertyOptional() @IsNumber() @Min(25) @Max(45) @IsOptional() temperature?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() urine?: string;

  @ApiPropertyOptional() @IsInt() @Min(0) @Max(12) @IsOptional() contractionsPer10?: number;
  @ApiPropertyOptional({ description: 'Seconds' })
  @IsInt() @Min(0) @Max(240) @IsOptional() contractionDuration?: number;

  @ApiPropertyOptional({ description: 'Cervical dilatation, cm' })
  @IsNumber() @Min(0) @Max(10) @IsOptional() cervix?: number;

  @ApiPropertyOptional({ description: 'Fifths palpable above the brim' })
  @IsInt() @Min(0) @Max(5) @IsOptional() descent?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() oxytocin?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() medicine?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() ivFluids?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() assessment?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() plan?: string;
}
