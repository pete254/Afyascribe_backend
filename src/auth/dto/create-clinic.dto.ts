import { IsString, IsEmail, IsEnum, MinLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClinicDto {
  @ApiProperty({
    example: 'K7P2M9QX',
    description: 'The one-time creation code issued by AfyaScribe. Required.',
  })
  @IsString()
  creationCode: string;

  @ApiProperty({ example: 'Wanjiru Family Clinic' })
  @IsString()
  facilityName: string;

  @ApiProperty({ example: 'WFC' })
  @IsString()
  @Length(2, 8)
  facilityCode: string;

  @ApiProperty({ enum: ['solo', 'team', 'multi'] })
  @IsEnum(['solo', 'team', 'multi'])
  clinicMode: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;
}
