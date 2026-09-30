import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { AdxService } from './adx.service';

const asDate = (s?: string): Date | undefined => {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const asInt = (s?: string): number | undefined => {
  const n = Number(s);
  return Number.isInteger(n) ? n : undefined;
};

/**
 * ADX — the MOH returns as SDMX, for exchange with an aggregate reporting
 * system rather than with a clinical one.
 *
 * Aggregate figures carry no patient, so these routes are gated on the same
 * reporting roles as the returns themselves rather than on clinical access.
 */
@ApiTags('adx')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin')
@Controller('adx')
export class AdxController {
  constructor(private readonly adx: AdxService) {}

  @Get('datasets')
  @ApiOperation({
    summary: 'The returns that can be emitted as ADX, and what each one carries',
  })
  datasets() {
    return this.adx.catalogue();
  }

  @Get(':dataSet/data')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({
    summary: 'One return as an ADX data message',
    description:
      'MOH 505 takes year and week, since it is reported by epidemiological week. Every other return takes from and to, the same dates the report endpoints use, and defaults to the current month.',
  })
  async data(
    @CurrentUser() user: CurrentUserType,
    @Param('dataSet') dataSet: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<string> {
    const { xml } = await this.adx.export(user.facilityId, dataSet, {
      from: asDate(from),
      to: asDate(to),
      year: asInt(year),
      week: asInt(week),
    });
    return xml;
  }

  @Get(':dataSet/dsd')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({
    summary: "The data set's SDMX v2.1 Data Structure Definition",
    description:
      'ADX requires a DSD: without it a message is numbers with codes and no stated meaning. Built for the same period as the data, so it enumerates exactly the codes that message uses.',
  })
  async dsd(
    @CurrentUser() user: CurrentUserType,
    @Param('dataSet') dataSet: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<string> {
    return this.adx.dsd(user.facilityId, dataSet, {
      from: asDate(from),
      to: asDate(to),
      year: asInt(year),
      week: asInt(week),
    });
  }

  @Get(':dataSet/summary')
  @ApiOperation({
    summary: 'What a message for this period would contain, and what to know before trusting it',
    description:
      'The same work as the data route, without the XML — the figure count, the orgUnit and whether it is nationally resolvable, and the caveats that belong with the numbers.',
  })
  async summary(
    @CurrentUser() user: CurrentUserType,
    @Param('dataSet') dataSet: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    const { meta } = await this.adx.export(user.facilityId, dataSet, {
      from: asDate(from),
      to: asDate(to),
      year: asInt(year),
      week: asInt(week),
    });
    return meta;
  }
}
