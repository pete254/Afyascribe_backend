import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto, UpdateAssetDto, AddAssetEventDto } from './dto/asset.dto';

function facilityOf(user: CurrentUserType): string {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  return user.facilityId;
}

@ApiTags('assets')
@ApiBearerAuth('JWT-auth')
@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('facility_admin', 'super_admin', 'accountant')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserType,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.assets.list(facilityOf(user), { type, status, q });
  }

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.assets.summary(facilityOf(user));
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.assets.get(facilityOf(user), id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateAssetDto) {
    return this.assets.create(facilityOf(user), dto, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(facilityOf(user), id, dto);
  }

  @Post(':id/events')
  addEvent(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: AddAssetEventDto) {
    return this.assets.addEvent(facilityOf(user), id, dto, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.assets.remove(facilityOf(user), id);
  }
}
