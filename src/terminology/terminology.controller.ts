import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TerminologyService } from './terminology.service';
import { TerminologySyncService } from './terminology-sync.service';

@ApiTags('terminology')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('terminology')
export class TerminologyController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly sync: TerminologySyncService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search KNHTS concepts by domain and/or system' })
  search(
    @Query('q') q: string,
    @Query('domain') domain?: string,
    @Query('system') system?: string,
    @Query('limit') limit?: string,
  ) {
    return this.terminology.search({
      q,
      domain,
      system,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('validate')
  @ApiOperation({ summary: 'Validate a code within a KNHTS system' })
  async validate(@Query('system') system: string, @Query('code') code: string) {
    const hit = await this.terminology.validate(system, code);
    return { valid: !!hit, concept: hit };
  }

  @Get('systems')
  @ApiOperation({ summary: 'List mirrored code systems with counts' })
  systems() {
    return this.terminology.systems();
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({
    summary: 'Sync KNHTS sources into the local mirror (runs in the background)',
  })
  triggerSync(
    @Body() body: { org?: string; source?: string; includeOptional?: boolean } = {},
  ) {
    // Fire-and-forget: large sources (ICD-11, HPT) take minutes — don't hold the
    // HTTP request open. Progress is logged server-side.
    const run =
      body.org && body.source
        ? this.sync.syncSource(body.org, body.source)
        : this.sync.syncAll(!!body.includeOptional);
    run.catch(() => undefined);
    return {
      started: true,
      target: body.org && body.source ? `${body.org}/${body.source}` : 'all default sources',
    };
  }
}
