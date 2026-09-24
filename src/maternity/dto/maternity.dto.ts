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
import { BLOOD_GROUPS, REACTIVE_RESULTS } from '../data/profile';
import {
  DELIVERY_MODES,
  DIPSTICK_RESULTS,
  FEEDING_METHODS,
  LOCHIA_AMOUNTS,
  PREGNANCY_OUTCOMES,
  PRESENTATIONS,
  SCREEN_RESULTS,
} from '../maternity.enums';
import { PNC_CONTACTS } from '../data/schedules';

const PNC_WINDOWS = PNC_CONTACTS.map((c) => c.window);

export class StartPregnancyDto {
  @ApiProperty() @IsUUID() patientId: string;

  @ApiPropertyOptional({ description: 'Last menstrual period; the EDD follows from it' })
  @IsDateString() @IsOptional() lmp?: string;

  @ApiPropertyOptional({ description: 'Used only where there is no period to work from' })
  @IsDateString() @IsOptional() eddEntered?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() ultrasoundDate?: string;

  @ApiPropertyOptional({ description: 'Gestation the scan showed, in days' })
  @IsInt() @Min(0) @Max(320) @IsOptional() ultrasoundGaDays?: number;

  @ApiPropertyOptional() @IsInt() @Min(1) @Max(30) @IsOptional() gravida?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(30) @IsOptional() para?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(30) @IsOptional() livingChildren?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() riskFactors?: string[];

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class UpdatePregnancyDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() lmp?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() eddEntered?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() ultrasoundDate?: string;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(320) @IsOptional() ultrasoundGaDays?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(30) @IsOptional() gravida?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(30) @IsOptional() para?: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(30) @IsOptional() livingChildren?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() riskFactors?: string[];

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

/** The antenatal profile, recorded once per pregnancy as results come back. */
export class ProfileDto {
  @ApiPropertyOptional({ description: 'Haemoglobin, g/dL' })
  @IsNumber() @Min(0) @Max(30) @IsOptional() profileHb?: number;

  @ApiPropertyOptional({ enum: BLOOD_GROUPS })
  @IsIn(BLOOD_GROUPS as unknown as string[]) @IsOptional() profileBloodGroup?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() profileUrinalysis?: string;

  @ApiPropertyOptional({ description: 'Random blood sugar, mmol/L' })
  @IsNumber() @Min(0) @Max(60) @IsOptional() profileRbs?: number;

  @ApiPropertyOptional({ enum: REACTIVE_RESULTS })
  @IsIn(REACTIVE_RESULTS as unknown as string[]) @IsOptional() profileSyphilis?: string;

  @ApiPropertyOptional({ enum: REACTIVE_RESULTS })
  @IsIn(REACTIVE_RESULTS as unknown as string[]) @IsOptional() profileHepB?: string;

  @ApiPropertyOptional({ enum: REACTIVE_RESULTS })
  @IsIn(REACTIVE_RESULTS as unknown as string[]) @IsOptional() profileHiv?: string;

  @ApiPropertyOptional({ enum: REACTIVE_RESULTS })
  @IsIn(REACTIVE_RESULTS as unknown as string[]) @IsOptional() profileTb?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() profileDate?: string;
}

export class PregnancyOutcomeDto {
  @ApiProperty({ enum: PREGNANCY_OUTCOMES })
  @IsIn(PREGNANCY_OUTCOMES) outcome: string;

  @ApiProperty() @IsDateString() outcomeDate: string;

  @ApiPropertyOptional({ enum: DELIVERY_MODES })
  @IsIn(DELIVERY_MODES) @IsOptional() deliveryMode?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() placeOfBirth?: string;

  @ApiPropertyOptional({ description: 'How many babies were born, so twins are not lost' })
  @IsInt() @Min(0) @Max(10) @IsOptional() babiesBorn?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
}

export class AncContactDto {
  @ApiProperty() @IsUUID() pregnancyId: string;

  @ApiProperty({ description: 'Which of the eight contacts this is' })
  @IsInt() @Min(1) @Max(20) contactNumber: number;

  @ApiProperty() @IsDateString() contactDate: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;

  @ApiPropertyOptional() @IsNumber() @Min(20) @Max(300) @IsOptional() weight?: number;
  @ApiPropertyOptional() @IsInt() @Min(40) @Max(300) @IsOptional() bpSystolic?: number;
  @ApiPropertyOptional() @IsInt() @Min(20) @Max(200) @IsOptional() bpDiastolic?: number;
  @ApiPropertyOptional() @IsInt() @Min(20) @Max(250) @IsOptional() pulse?: number;
  @ApiPropertyOptional() @IsNumber() @Min(25) @Max(45) @IsOptional() temperature?: number;
  @ApiPropertyOptional() @IsNumber() @Min(5) @Max(70) @IsOptional() muac?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @Max(30) @IsOptional() hb?: number;

  @ApiPropertyOptional({ enum: DIPSTICK_RESULTS })
  @IsIn(DIPSTICK_RESULTS) @IsOptional() urineProtein?: string;

  @ApiPropertyOptional({ enum: DIPSTICK_RESULTS })
  @IsIn(DIPSTICK_RESULTS) @IsOptional() urineSugar?: string;

  @ApiPropertyOptional({ description: 'Symphysis–fundal height, cm' })
  @IsInt() @Min(5) @Max(60) @IsOptional() fundalHeight?: number;

  @ApiPropertyOptional() @IsInt() @Min(50) @Max(250) @IsOptional() fetalHeartRate?: number;

  @ApiPropertyOptional({ enum: PRESENTATIONS })
  @IsIn(PRESENTATIONS) @IsOptional() presentation?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() fetalMovement?: boolean;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() ifasGiven?: boolean;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(6) @IsOptional() iptpDose?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() dewormingGiven?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() llinGiven?: boolean;
  @ApiPropertyOptional({ description: 'Td dose number; also written to the immunisation record' })
  @IsInt() @Min(1) @Max(5) @IsOptional() tdDose?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() aspirinGiven?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() calciumGiven?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() dangerSigns?: string[];

  @ApiPropertyOptional() @IsBoolean() @IsOptional() referred?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() referredTo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() findings?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() nextContactDate?: string;
}

export class PncContactDto {
  @ApiProperty() @IsUUID() pregnancyId: string;
  @ApiProperty() @IsDateString() contactDate: string;

  @ApiPropertyOptional({ enum: PNC_WINDOWS, description: 'Worked out from the date when left out' })
  @IsIn(PNC_WINDOWS) @IsOptional() window?: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() visitId?: string;
  @ApiPropertyOptional({ description: 'The newborn, once registered as a patient' })
  @IsUUID() @IsOptional() babyPatientId?: string;

  @ApiPropertyOptional() @IsInt() @Min(40) @Max(300) @IsOptional() bpSystolic?: number;
  @ApiPropertyOptional() @IsInt() @Min(20) @Max(200) @IsOptional() bpDiastolic?: number;
  @ApiPropertyOptional() @IsInt() @Min(20) @Max(250) @IsOptional() pulse?: number;
  @ApiPropertyOptional() @IsNumber() @Min(25) @Max(45) @IsOptional() temperature?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @Max(30) @IsOptional() hb?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() uterineInvolution?: string;

  @ApiPropertyOptional({ enum: LOCHIA_AMOUNTS })
  @IsIn(LOCHIA_AMOUNTS) @IsOptional() lochiaAmount?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() lochiaOffensive?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() breastFindings?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() perineumFindings?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() maternalDangerSigns?: string[];

  @ApiPropertyOptional({ description: 'Felt down, depressed or hopeless in the past month' })
  @IsBoolean() @IsOptional() depressionQ1?: boolean;

  @ApiPropertyOptional({ description: 'Little interest or pleasure in doing things' })
  @IsBoolean() @IsOptional() depressionQ2?: boolean;

  @ApiPropertyOptional({ enum: SCREEN_RESULTS })
  @IsIn(SCREEN_RESULTS) @IsOptional() ipvScreen?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() fpCounselled?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() fpMethod?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() cervicalScreeningOffered?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() vitaminAGiven?: boolean;

  @ApiPropertyOptional({ description: 'Baby weight, kg' })
  @IsNumber() @Min(0.2) @Max(30) @IsOptional() babyWeight?: number;

  @ApiPropertyOptional() @IsNumber() @Min(25) @Max(45) @IsOptional() babyTemperature?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() cordCondition?: string;

  @ApiPropertyOptional({ enum: FEEDING_METHODS })
  @IsIn(FEEDING_METHODS) @IsOptional() feedingMethod?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() babyDangerSigns?: string[];

  @ApiPropertyOptional() @IsBoolean() @IsOptional() immunisationUpToDate?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() birthNotified?: boolean;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() referred?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() referredTo?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() findings?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() nextContactDate?: string;
}
