import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { InpatientService } from './inpatient.service';
import {
  CreateWardDto,
  UpdateWardDto,
  CreateBedsDto,
  UpdateBedDto,
  CreateAdmissionDto,
  DischargeAdmissionDto,
  TransferAdmissionDto,
} from './dto/inpatient.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Wards, beds and admissions — the inpatient / ward-management module. */
@ApiTags('inpatient')
@ApiBearerAuth('JWT-auth')
@Controller('inpatient')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'doctor', 'nurse', 'receptionist')
export class InpatientController {
  constructor(private readonly svc: InpatientService) {}

  // ── Census ────────────────────────────────────────────────────────────────
  @Get('census')
  census(@CurrentUser() user: CurrentUserType) {
    return this.svc.census(facilityOf(user));
  }

  // ── Wards ─────────────────────────────────────────────────────────────────
  @Get('wards')
  listWards(@CurrentUser() user: CurrentUserType) {
    return this.svc.listWards(facilityOf(user));
  }

  @Post('wards')
  @Roles('facility_admin', 'super_admin', 'nurse')
  createWard(@CurrentUser() user: CurrentUserType, @Body() dto: CreateWardDto) {
    return this.svc.createWard(facilityOf(user), dto);
  }

  @Patch('wards/:id')
  @Roles('facility_admin', 'super_admin', 'nurse')
  updateWard(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateWardDto) {
    return this.svc.updateWard(facilityOf(user), id, dto);
  }

  @Delete('wards/:id')
  @Roles('facility_admin', 'super_admin')
  deleteWard(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.svc.deleteWard(facilityOf(user), id);
  }

  // ── Beds ──────────────────────────────────────────────────────────────────
  @Get('beds')
  listBeds(@CurrentUser() user: CurrentUserType, @Query('wardId') wardId?: string) {
    return this.svc.listBeds(facilityOf(user), wardId);
  }

  @Post('beds')
  @Roles('facility_admin', 'super_admin', 'nurse')
  addBeds(@CurrentUser() user: CurrentUserType, @Body() dto: CreateBedsDto) {
    return this.svc.addBeds(facilityOf(user), dto);
  }

  @Patch('beds/:id')
  @Roles('facility_admin', 'super_admin', 'nurse')
  updateBed(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateBedDto) {
    return this.svc.updateBed(facilityOf(user), id, dto);
  }

  @Delete('beds/:id')
  @Roles('facility_admin', 'super_admin', 'nurse')
  deleteBed(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.svc.deleteBed(facilityOf(user), id);
  }

  // ── Admissions ────────────────────────────────────────────────────────────
  @Get('admissions')
  listAdmissions(@CurrentUser() user: CurrentUserType, @Query('status') status?: string) {
    return this.svc.listAdmissions(facilityOf(user), status);
  }

  @Post('admissions')
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
  admit(@CurrentUser() user: CurrentUserType, @Body() dto: CreateAdmissionDto) {
    return this.svc.admit(facilityOf(user), dto, user.id);
  }

  @Patch('admissions/:id/discharge')
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
  discharge(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: DischargeAdmissionDto,
  ) {
    return this.svc.discharge(facilityOf(user), id, dto);
  }

  @Patch('admissions/:id/transfer')
  @Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
  transfer(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: TransferAdmissionDto,
  ) {
    return this.svc.transfer(facilityOf(user), id, dto);
  }
}
