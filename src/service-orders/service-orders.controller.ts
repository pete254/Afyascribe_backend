import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { ServiceOrdersService } from './service-orders.service';
import { CreateServiceOrderDto, RecordSessionDto, UpdateServiceOrderDto } from './dto/service-order.dto';
import { DISCIPLINE_LABELS, SERVICE_DISCIPLINES } from './service-order.enums';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Clinical services ordered by a provider and fulfilled by another department:
 * physiotherapy, occupational therapy, nutrition, social work, counselling.
 */
@ApiTags('service-orders')
@ApiBearerAuth('JWT-auth')
@Controller('service-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'doctor',
  'nurse',
  'clinical_officer',
  'physiotherapist',
  'occupational_therapist',
  'nutritionist',
  'social_worker',
  'counsellor',
  'psychologist',
  'speech_therapist',
  'facility_admin',
  'super_admin',
)
export class ServiceOrdersController {
  constructor(private readonly service: ServiceOrdersService) {}

  @Get('disciplines')
  @ApiOperation({ summary: 'The service disciplines that can be ordered' })
  disciplines() {
    return SERVICE_DISCIPLINES.map((value) => ({ value, label: DISCIPLINE_LABELS[value] }));
  }

  @Get()
  @ApiOperation({ summary: "A department's worklist, or one patient's service orders" })
  list(
    @CurrentUser() user: CurrentUserType,
    @Query('discipline') discipline?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.service.list(facilityOf(user), { discipline, status, patientId });
  }

  @Post()
  @ApiOperation({ summary: 'Order a clinical service for a patient' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateServiceOrderDto) {
    return this.service.create(facilityOf(user), dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Schedule, complete or cancel an order' })
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateServiceOrderDto) {
    return this.service.update(facilityOf(user), id, dto, user);
  }

  @Post(':id/sessions')
  @ApiOperation({ summary: 'Record a session of care against the order (may carry its own charge)' })
  recordSession(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: RecordSessionDto) {
    return this.service.recordSession(facilityOf(user), id, dto, user);
  }
}
