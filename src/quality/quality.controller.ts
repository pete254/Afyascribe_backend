import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { QualityService } from './quality.service';
import { periodFor } from './quality';
import { CaptureMeasureDto } from './dto/quality.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

const nameOf = (u: CurrentUserType) =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || null;

/** Clinical quality measures: capture, calculate, import, export and submit. */
@ApiTags('quality')
@ApiBearerAuth('JWT-auth')
@Controller('quality')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'doctor', 'nurse')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  private period(year?: string, month?: string, from?: string, to?: string) {
    const p = periodFor({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      from,
      to,
    });
    if (!p) {
      throw new BadRequestException('Give a year and month, or a from and to date');
    }
    return p;
  }

  @Get('measures')
  @ApiOperation({ summary: 'Every measure this facility knows, built-in and imported' })
  measures(@CurrentUser() user: CurrentUserType) {
    return this.service.definitions(facilityOf(user));
  }

  @Get('calculate')
  @ApiOperation({ summary: 'Work out the built-in measures for a period, without storing them' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  calculate(
    @CurrentUser() user: CurrentUserType,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const p = this.period(year, month, from, to);
    return this.service.calculate(facilityOf(user), p.from, p.to);
  }

  @Post('calculate')
  @ApiOperation({ summary: 'Work out the period and store it, so it can be submitted later' })
  calculateAndStore(
    @CurrentUser() user: CurrentUserType,
    @Body() body: { year?: number; month?: number; from?: string; to?: string },
  ) {
    const p = this.period(
      body.year ? String(body.year) : undefined,
      body.month ? String(body.month) : undefined,
      body.from,
      body.to,
    );
    return this.service.calculateAndStore(facilityOf(user), p.from, p.to, nameOf(user));
  }

  @Get('values')
  @ApiOperation({ summary: 'Stored values, calculated and captured, for a range' })
  values(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!from || !to) throw new BadRequestException('Give a from and to date');
    return this.service.stored(facilityOf(user), from, to);
  }

  @Post('capture')
  @ApiOperation({ summary: 'Enter a value by hand for a measure this system cannot work out' })
  capture(@CurrentUser() user: CurrentUserType, @Body() dto: CaptureMeasureDto) {
    return this.service.capture(facilityOf(user), dto, nameOf(user));
  }

  @Post('measures/import')
  @ApiOperation({ summary: 'Import a measure definition (FHIR Measure, or this system’s shape)' })
  importMeasure(@CurrentUser() user: CurrentUserType, @Body() doc: Record<string, unknown>) {
    return this.service.importMeasure(facilityOf(user), doc, nameOf(user));
  }

  @Get('export/fhir')
  @ApiOperation({ summary: 'The period as FHIR MeasureReports, one per measure' })
  exportFhir(
    @CurrentUser() user: CurrentUserType,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const p = this.period(year, month, from, to);
    return this.service.exportFhir(facilityOf(user), p.from, p.to);
  }

  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="quality-measures.csv"')
  @ApiOperation({ summary: 'The period as a CSV, with every definition beside its number' })
  exportCsv(
    @CurrentUser() user: CurrentUserType,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const p = this.period(year, month, from, to);
    return this.service.exportCsv(facilityOf(user), p.from, p.to);
  }

  @Post('submit')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: "Send the period's reports to the configured endpoint" })
  submit(
    @CurrentUser() user: CurrentUserType,
    @Body() body: { year?: number; month?: number; from?: string; to?: string },
  ) {
    const p = this.period(
      body.year ? String(body.year) : undefined,
      body.month ? String(body.month) : undefined,
      body.from,
      body.to,
    );
    return this.service.submit(facilityOf(user), p.from, p.to);
  }
}
