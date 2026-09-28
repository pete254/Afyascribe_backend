import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { SignaturesService } from './signatures.service';

/** Digital signatures over clinical records, with a key per practitioner. */
@ApiTags('signatures')
@ApiBearerAuth('JWT-auth')
@Controller('signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignaturesController {
  constructor(private readonly service: SignaturesService) {}

  @Get('types')
  @ApiOperation({ summary: 'What can be signed, and what a signature here does and does not prove' })
  types() {
    return this.service.signableTypes();
  }

  @Get('my-key')
  @Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'lab_technician', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Your signing key, if you have one' })
  async myKey(@CurrentUser() user: CurrentUserType) {
    const key = await this.service.myKey(user.id);
    if (!key) return { enrolled: false };
    // The encrypted private key never leaves the server, even to its owner.
    return {
      enrolled: true,
      fingerprint: key.fingerprint,
      algorithm: key.algorithm,
      publicKey: key.publicKey,
      practitionerNo: key.practitionerNo,
      createdAt: key.createdAt,
    };
  }

  @Post('my-key')
  @Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'lab_technician', 'facility_admin', 'super_admin')
  @ApiOperation({
    summary: 'Set a signing PIN, creating or rotating your key',
    description:
      'The PIN never leaves this request. Nobody — including an administrator, or anyone holding the database — can sign as you without it. Lose it and the key cannot be recovered, only replaced.',
  })
  enrol(@CurrentUser() user: CurrentUserType, @Body() body: { pin: string; rotateReason?: string }) {
    if (!body?.pin) throw new BadRequestException('A signing PIN is required');
    return this.service.enrol(user, body.pin, body.rotateReason);
  }

  @Post('sign')
  @Roles('doctor', 'nurse', 'clinical_officer', 'pharmacist', 'lab_technician', 'facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Sign a record with your key' })
  sign(
    @CurrentUser() user: CurrentUserType,
    @Body() body: { entityName: string; entityId: string; pin: string; purpose?: string },
  ) {
    return this.service.sign(user, body);
  }

  @Get('verify/:entityName/:entityId')
  @ApiOperation({
    summary: "Check a record's signatures",
    description:
      'Says separately whether each signature verifies and whether the record has changed since it was signed — different failures that a reviewer needs to tell apart.',
  })
  verify(@Param('entityName') entityName: string, @Param('entityId') entityId: string) {
    return this.service.verifyRecord(entityName, entityId);
  }

  @Get('public-key/:fingerprint')
  @ApiOperation({
    summary: 'A public key, so a signature can be checked without this system',
  })
  publicKey(@Param('fingerprint') fingerprint: string) {
    return this.service.publicKey(fingerprint);
  }
}
