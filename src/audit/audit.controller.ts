import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AUDIT_RETENTION_YEARS, AuditService } from './audit.service';
import { RecordAuditReviewDto } from './dto/audit-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('audit')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'The staff/user audit ledger — who did what, when' })
  list(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
    @Query('category') category?: string,
    @Query('patientId') patientId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list(user.facilityId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      actorId,
      entityType,
      category,
      patientId,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('entity-types')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Distinct entity types in the audit ledger (for filtering)' })
  entityTypes(@CurrentUser() user: any) {
    return this.service.entityTypes(user.facilityId);
  }

  @Get('integrity')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({
    summary: 'Verify the ledger has not been tampered with, and say where if it has',
  })
  integrity(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.verify({
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    });
  }

  @Get('patients/:patientId')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: "Everyone who has touched one patient's record" })
  patientAccess(
    @CurrentUser() user: any,
    @Param('patientId') patientId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.patientAccess(user.facilityId, patientId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('reviews')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Past quarterly reviews, and when the next falls due' })
  reviews(@CurrentUser() user: any) {
    return this.service.reviewHistory(user.facilityId);
  }

  @Post('reviews')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'Record a quarterly review of the log' })
  recordReview(@CurrentUser() user: any, @Body() dto: RecordAuditReviewDto) {
    if (dto.periodTo < dto.periodFrom) {
      throw new BadRequestException('The period ends before it begins');
    }
    return this.service.recordReview(user.facilityId, {
      ...dto,
      reviewedById: user.id ?? null,
      reviewedByName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || null,
    });
  }

  @Get('policy')
  @Roles('facility_admin', 'super_admin')
  @ApiOperation({ summary: 'What the ledger guarantees, and the obligation it meets' })
  policy() {
    return {
      retentionYears: AUDIT_RETENTION_YEARS,
      basis:
        'Digital Health (Health Information Management Procedures) Regulations, 2025 — made under the Digital Health Act, 2023',
      requirements: [
        'All user actions and data access are logged, reads as well as writes.',
        'Each line carries timestamp, user id and the action performed.',
        'Each line is chained by SHA-256 to the one before it, so an alteration or deletion cannot be hidden.',
        'The table rejects UPDATE and DELETE at the database level.',
        `Lines are retained for at least ${AUDIT_RETENTION_YEARS} years; nothing in this system prunes them.`,
        'Access to the ledger is restricted to facility administrators.',
        'Reviews are recorded quarterly, with the integrity check run at the time.',
      ],
      limits: [
        'A database superuser can drop the trigger and rewrite rows. The chain is what makes that visible afterwards; it cannot prevent it.',
        'Lines written before this ledger was hardened are unhashed, and verification reports them as such rather than pretending otherwise.',
      ],
    };
  }
}