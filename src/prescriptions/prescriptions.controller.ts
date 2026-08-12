import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CapabilityGuard } from '../auth/guards/capability.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireCapability } from '../auth/decorators/require-capability.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { PrescriptionsService } from './prescriptions.service';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionItemsDto,
} from './dto/prescription.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Prescriptions & pharmacy dispensing. A doctor writes a prescription in the
 * consultation; it lands in the pharmacy queue, where the pharmacist prices and
 * bills each line and then dispenses it (depleting stock). Kept accessible to
 * clinical + pharmacy roles (and owners, who are doctors) so a solo clinic can
 * run the whole flow on one account.
 */
@ApiTags('prescriptions')
@ApiBearerAuth('JWT-auth')
@Controller('prescriptions')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles('doctor', 'nurse', 'pharmacist', 'storekeeper', 'cashier', 'facility_admin', 'super_admin')
export class PrescriptionsController {
  constructor(private readonly service: PrescriptionsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePrescriptionDto) {
    return this.service.create(facilityOf(user), user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserType,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
  ) {
    return this.service.listQueue(facilityOf(user), { status, patientId, visitId });
  }

  /** Count of pending prescriptions — polled for the sidebar badge. */
  @Get('count')
  count(@CurrentUser() user: CurrentUserType) {
    return this.service.pendingCount(facilityOf(user));
  }

  @Get('visit/:visitId')
  byVisit(@CurrentUser() user: CurrentUserType, @Param('visitId') visitId: string) {
    return this.service.listQueue(facilityOf(user), { visitId });
  }

  @Get(':id')
  getOne(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.getOne(facilityOf(user), id);
  }

  @Patch(':id/items')
  updateItems(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionItemsDto,
  ) {
    return this.service.updateItems(facilityOf(user), id, dto);
  }

  @Post(':id/bill')
  bill(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.sendToBilling(facilityOf(user), id);
  }

  @Post(':id/dispense')
  @RequireCapability('dispense_drugs')
  dispense(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.dispense(facilityOf(user), user, id);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.cancel(facilityOf(user), id);
  }
}
