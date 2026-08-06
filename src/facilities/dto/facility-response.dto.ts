// src/facilities/dto/facility-response.dto.ts
import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FacilityResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  code: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  type: string;

  @Expose()
  @ApiProperty()
  status: string;

  @Expose()
  @ApiProperty()
  phone: string;

  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty()
  address: string;

  @Expose()
  @ApiProperty()
  county: string;

  @Expose()
  @ApiProperty()
  subCounty: string;

  @Expose()
  @ApiProperty()
  licenseNumber: string;

  @Expose()
  @ApiProperty()
  logoUrl: string;

  @Expose()
  @ApiProperty()
  isActive: boolean;

  /** solo | team | multi — how the practice is staffed. */
  @Expose()
  @ApiProperty()
  clinicMode: string;

  /** When true, the accountant can approve LPOs without owner sign-off. */
  @Expose()
  @ApiProperty()
  accountantCanApproveLpo: boolean;

  /** When true, staff sign in with password only (daily login OTP skipped). */
  @Expose()
  @ApiProperty()
  loginOtpDisabled: boolean;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}