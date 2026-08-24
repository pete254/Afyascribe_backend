import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
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
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list(user.facilityId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      actorId,
      entityType,
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
}
