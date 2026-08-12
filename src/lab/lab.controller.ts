import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CapabilityGuard } from '../auth/guards/capability.guard';
import { RequireCapability } from '../auth/decorators/require-capability.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { LabService } from './lab.service';
import { LabStatus } from './entities/lab-order.entity';
import {
  CreateLabTestDto,
  UpdateLabTestDto,
  CreateLabOrderDto,
  CollectSampleDto,
  SubmitResultDto,
} from './dto/lab.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/**
 * Laboratory — test catalog, ordering, and the collect → test → post-result
 * worklist. Kept accessible to clinical + lab roles (and owners, who are
 * doctors) so a solo clinic can run the whole flow on one account.
 */
@ApiTags('lab')
@ApiBearerAuth('JWT-auth')
@Controller('lab')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles('doctor', 'nurse', 'lab_technician', 'facility_admin', 'super_admin')
export class LabController {
  constructor(private readonly lab: LabService) {}

  // ── Catalog ─────────────────────────────────────────────────────────────────

  @Get('tests')
  listTests(@CurrentUser() user: CurrentUserType, @Query('activeOnly') activeOnly?: string) {
    return this.lab.listTests(facilityOf(user), { activeOnly: activeOnly === 'true' });
  }

  @Post('tests')
  @RequireCapability('manage_lab_catalog')
  createTest(@CurrentUser() user: CurrentUserType, @Body() dto: CreateLabTestDto) {
    return this.lab.createTest(facilityOf(user), dto);
  }

  @Patch('tests/:id')
  @RequireCapability('manage_lab_catalog')
  updateTest(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateLabTestDto) {
    return this.lab.updateTest(facilityOf(user), id, dto);
  }

  @Post('tests/seed')
  @ApiOperation({ summary: 'Seed a starter catalog of common tests (only when empty)' })
  seed(@CurrentUser() user: CurrentUserType) {
    return this.lab.seedTests(facilityOf(user));
  }

  // ── Orders + worklist ─────────────────────────────────────────────────────────

  @Post('orders')
  @RequireCapability('order_lab')
  createOrder(@CurrentUser() user: CurrentUserType, @Body() dto: CreateLabOrderDto) {
    return this.lab.createOrder(facilityOf(user), user, dto);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: CurrentUserType,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
  ) {
    return this.lab.listOrders(facilityOf(user), { status, patientId, visitId });
  }

  @Get('worklist')
  @ApiOperation({ summary: 'Test items at a given stage (ordered|collected|in_progress|resulted)' })
  worklist(@CurrentUser() user: CurrentUserType, @Query('stage') stage: LabStatus) {
    return this.lab.worklist(facilityOf(user), stage ?? 'ordered');
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.lab.getOrder(facilityOf(user), id);
  }

  @Get('patients/:patientId/results')
  patientResults(@CurrentUser() user: CurrentUserType, @Param('patientId') patientId: string) {
    return this.lab.patientResults(facilityOf(user), patientId);
  }

  // ── Workflow transitions ───────────────────────────────────────────────────────

  @Patch('orders/:id/items/:itemId/collect')
  @RequireCapability('run_lab')
  @ApiOperation({ summary: 'Sample collection / phlebotomy' })
  collect(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CollectSampleDto,
  ) {
    return this.lab.collect(facilityOf(user), id, itemId, user, dto);
  }

  @Patch('orders/:id/items/:itemId/start')
  @RequireCapability('run_lab')
  @ApiOperation({ summary: 'Begin testing the collected sample' })
  start(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.lab.startTest(facilityOf(user), id, itemId);
  }

  @Put('orders/:id/items/:itemId/result')
  @RequireCapability('run_lab')
  @ApiOperation({ summary: 'Enter results (post=true also posts them to the record)' })
  result(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: SubmitResultDto,
  ) {
    return this.lab.submitResult(facilityOf(user), id, itemId, user, dto);
  }

  @Patch('orders/:id/items/:itemId/verify')
  @RequireCapability('run_lab')
  @ApiOperation({ summary: 'Post results to the system (final)' })
  verify(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.lab.verify(facilityOf(user), id, itemId, user);
  }

  @Patch('orders/:id/items/:itemId/cancel')
  cancel(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.lab.cancelItem(facilityOf(user), id, itemId);
  }
}
