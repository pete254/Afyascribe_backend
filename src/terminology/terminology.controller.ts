import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TerminologyService } from './terminology.service';
import { TerminologySyncService } from './terminology-sync.service';
import { SnomedImportService } from './snomed-import.service';
import { SNOMED_ATTRIBUTION } from './snomed-gps';

@ApiTags('terminology')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('terminology')
export class TerminologyController {
  private readonly logger = new Logger(TerminologyController.name);

  constructor(
    private readonly terminology: TerminologyService,
    private readonly sync: TerminologySyncService,
    private readonly snomed: SnomedImportService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search KNHTS concepts by domain and/or system' })
  search(
    @Query('q') q: string,
    @Query('domain') domain?: string,
    @Query('system') system?: string,
    @Query('tier') tier?: string,
    @Query('limit') limit?: string,
  ) {
    return this.terminology.search({
      q,
      domain,
      system,
      tier,
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
  // ── SNOMED CT (Global Patient Set) ────────────────────────────────────────

  @Get('snomed/status')
  @ApiOperation({
    summary: 'How much of the SNOMED Global Patient Set is loaded',
    description:
      'Includes the attribution notice, which the CC BY-ND licence requires wherever SNOMED terms are shown.',
  })
  snomedStatus() {
    return this.snomed.status();
  }

  @Post('snomed/import')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  @ApiOperation({
    summary: 'Load the SNOMED Global Patient Set from a file on the server',
    description:
      "Kenya is not a SNOMED International member, so there is no national release to sync from. The GPS is the open route: register at snomed.org/gps, download the file, and give its path here. It is a flat set of identifiers and terms — no hierarchy, so coding and exchange work but subsumption does not.",
  })
  importSnomed(@Body() body: { path?: string; activeOnly?: boolean } = {}) {
    // Fail now if the file is not there. The import runs in the background,
    // so an error raised inside it would reach nobody.
    const { file, bytes } = this.snomed.assertReadable(body?.path ?? '');

    // Several hundred thousand rows: run it in the background rather than
    // holding the request open, as the KNHTS sync does.
    this.snomed
      .importFile(file, { activeOnly: body?.activeOnly })
      .catch((e) => this.logger.error(`SNOMED GPS import failed: ${e?.message ?? e}`));

    return {
      started: true,
      file,
      megabytes: Math.round(bytes / 1e5) / 10,
      note: 'Progress is logged server-side; poll snomed/status for the count.',
      attribution: SNOMED_ATTRIBUTION,
    };
  }

}
