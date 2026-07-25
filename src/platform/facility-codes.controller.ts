import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { FacilityCodesService } from './facility-codes.service';
import { CreateFacilityCodeDto } from './dto/platform.dto';
import { CreationCodeStatus } from './entities/facility-creation-code.entity';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('admin/facility-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class FacilityCodesController {
  constructor(private readonly service: FacilityCodesService) {}

  @Post()
  @ApiOperation({ summary: 'Issue a new facility creation code' })
  create(@Body() dto: CreateFacilityCodeDto, @CurrentUser() user: CurrentUserType) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List facility creation codes' })
  list(@Query('status') status?: CreationCodeStatus) {
    return this.service.list(status);
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke an unused code' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke(id);
  }
}
