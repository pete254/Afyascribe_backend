import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class LoginWithCodeDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty({
    description:
      'The 6-digit code — emailed, or from the authenticator app — or, with an authenticator app, one of its backup codes (e.g. ABCD-EFGH)',
  })
  @IsString()
  @Length(6, 12)
  code: string;
}
