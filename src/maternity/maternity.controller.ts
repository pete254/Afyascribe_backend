import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { MaternityService } from './maternity.service';
import {
  AncContactDto,
  PncContactDto,
  PregnancyOutcomeDto,
  ProfileDto,
  StartPregnancyDto,
  UpdatePregnancyDto,
} from './dto/maternity.dto';
import { ANC_CONTACTS, ANC_SOURCE, PNC_CONTACTS, PNC_SOURCE } from './data/schedules';
import { ANC_PROFILE, ANC_PROFILE_SOURCE, BLOOD_GROUPS, REACTIVE_RESULTS } from './data/profile';
import {
  ANC_DANGER_SIGNS,
  DANGER_SIGN_SOURCE,
  PNC_MATERNAL_DANGER_SIGNS,
  PNC_NEWBORN_DANGER_SIGNS,
} from './data/danger-signs';
import { DELIVERY_MODE_LABEL, FEEDING_LABEL, PREGNANCY_OUTCOMES } from './maternity.enums';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Antenatal and postnatal care, against Kenya's national schedules. */
@ApiTags('maternity')
@ApiBearerAuth('JWT-auth')
@Controller('maternity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor', 'nurse', 'clinical_officer', 'facility_admin', 'super_admin')
export class MaternityController {
  constructor(private readonly service: MaternityService) {}

  @Get('reference')
  @ApiOperation({ summary: 'The schedules, the profile panel and the danger signs, with their sources' })
  reference() {
    return {
      anc: { source: ANC_SOURCE, contacts: ANC_CONTACTS },
      pnc: { source: PNC_SOURCE, contacts: PNC_CONTACTS },
      profile: { source: ANC_PROFILE_SOURCE, tests: ANC_PROFILE, bloodGroups: BLOOD_GROUPS, reactiveResults: REACTIVE_RESULTS },
      dangerSigns: {
        source: DANGER_SIGN_SOURCE,
        anc: ANC_DANGER_SIGNS,
        pncMaternal: PNC_MATERNAL_DANGER_SIGNS,
        pncNewborn: PNC_NEWBORN_DANGER_SIGNS,
      },
      outcomes: PREGNANCY_OUTCOMES,
      deliveryModes: DELIVERY_MODE_LABEL,
      feedingMethods: FEEDING_LABEL,
    };
  }

  @Get('worklist')
  @ApiOperation({ summary: 'Open pregnancies with a contact due or overdue' })
  worklist(@CurrentUser() user: CurrentUserType) {
    return this.service.worklist(facilityOf(user));
  }

  @Get('patients/:patientId/pregnancies')
  @ApiOperation({ summary: "A patient's pregnancies, most recent first" })
  forPatient(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.service.listForPatient(facilityOf(user), patientId);
  }

  @Post('pregnancies')
  @ApiOperation({ summary: 'Book a pregnancy' })
  start(@CurrentUser() user: CurrentUserType, @Body() dto: StartPregnancyDto) {
    return this.service.start(facilityOf(user), dto, user);
  }

  @Get('pregnancies/:id')
  @ApiOperation({ summary: 'The card: dating, contacts, profile and what needs attention' })
  card(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.card(facilityOf(user), id);
  }

  @Patch('pregnancies/:id')
  @ApiOperation({ summary: 'Revise the dating or the obstetric history' })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdatePregnancyDto) {
    return this.service.update(facilityOf(user), id, dto);
  }

  @Patch('pregnancies/:id/profile')
  @ApiOperation({ summary: 'Record antenatal profile results as they come back' })
  profile(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: ProfileDto) {
    return this.service.saveProfile(facilityOf(user), id, dto);
  }

  @Post('pregnancies/:id/outcome')
  @ApiOperation({ summary: 'Close the pregnancy with its outcome' })
  outcome(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: PregnancyOutcomeDto) {
    return this.service.setOutcome(facilityOf(user), id, dto);
  }

  @Post('anc-contacts')
  @ApiOperation({ summary: 'Record an antenatal contact' })
  anc(@CurrentUser() user: CurrentUserType, @Body() dto: AncContactDto) {
    return this.service.recordAncContact(facilityOf(user), dto, user);
  }

  @Patch('anc-contacts/:id')
  @ApiOperation({ summary: 'Amend an antenatal contact' })
  amendAnc(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: AncContactDto) {
    return this.service.updateAncContact(facilityOf(user), id, dto);
  }

  @Delete('anc-contacts/:id')
  @ApiOperation({ summary: 'Remove an antenatal contact recorded in error' })
  removeAnc(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.removeAncContact(facilityOf(user), id);
  }

  @Post('pnc-contacts')
  @ApiOperation({ summary: 'Record a postnatal contact, for mother and baby' })
  pnc(@CurrentUser() user: CurrentUserType, @Body() dto: PncContactDto) {
    return this.service.recordPncContact(facilityOf(user), dto, user);
  }

  @Patch('pnc-contacts/:id')
  @ApiOperation({ summary: 'Amend a postnatal contact' })
  amendPnc(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: PncContactDto) {
    return this.service.updatePncContact(facilityOf(user), id, dto);
  }

  @Delete('pnc-contacts/:id')
  @ApiOperation({ summary: 'Remove a postnatal contact recorded in error' })
  removePnc(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.removePncContact(facilityOf(user), id);
  }
}
