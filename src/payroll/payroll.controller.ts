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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreatePayrollRunDto,
  UpdatePayrollSettingsDto,
} from './dto/payroll.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

/** Human Resource — employees and payroll processing. */
@ApiTags('payroll')
@ApiBearerAuth('JWT-auth')
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'hr_manager', 'accountant')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // ── Settings ──────────────────────────────────────────────────────────────
  @Get('settings')
  getSettings(@CurrentUser() user: CurrentUserType) {
    return this.payroll.getSettings(facilityOf(user));
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: CurrentUserType, @Body() dto: UpdatePayrollSettingsDto) {
    return this.payroll.updateSettings(facilityOf(user), dto);
  }

  // ── Employees ─────────────────────────────────────────────────────────────
  @Get('employees')
  listEmployees(@CurrentUser() user: CurrentUserType, @Query('activeOnly') activeOnly?: string) {
    return this.payroll.listEmployees(facilityOf(user), activeOnly === 'true');
  }

  @Post('employees')
  createEmployee(@CurrentUser() user: CurrentUserType, @Body() dto: CreateEmployeeDto) {
    return this.payroll.createEmployee(facilityOf(user), dto);
  }

  @Get('employees/:id')
  getEmployee(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.payroll.getEmployee(facilityOf(user), id);
  }

  @Patch('employees/:id')
  updateEmployee(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.payroll.updateEmployee(facilityOf(user), id, dto);
  }

  // ── Payroll runs ──────────────────────────────────────────────────────────
  @Get('runs')
  listRuns(@CurrentUser() user: CurrentUserType) {
    return this.payroll.listRuns(facilityOf(user));
  }

  @Post('runs')
  createRun(@CurrentUser() user: CurrentUserType, @Body() dto: CreatePayrollRunDto) {
    return this.payroll.createRun(facilityOf(user), dto, user.id);
  }

  @Get('runs/:id')
  getRun(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.payroll.getRun(facilityOf(user), id);
  }

  @Patch('runs/:id/approve')
  approveRun(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.payroll.approveRun(facilityOf(user), id, user.id);
  }

  @Patch('runs/:id/pay')
  payRun(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: { bankAccountCode?: string },
  ) {
    return this.payroll.payRun(facilityOf(user), id, body?.bankAccountCode, user.id);
  }
}
