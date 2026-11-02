import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, MaxLength, ValidateIf } from 'class-validator';

/** The facility's disease surveillance focal person, for reminders. Empty clears it. */
export class SurveillanceContactDto {
  @ApiPropertyOptional({
    nullable: true,
    example: 'surveillance@facility.co.ke',
  })
  @IsOptional()
  @ValidateIf((o: SurveillanceContactDto) => !!o.surveillanceEmail?.trim())
  @IsEmail(
    {},
    {
      message:
        'Enter a valid email address, or leave it empty to use the administrators.',
    },
  )
  @MaxLength(254)
  surveillanceEmail?: string | null;
}
