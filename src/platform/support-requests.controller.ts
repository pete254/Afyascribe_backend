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
import { SupportRequestsService } from './support-requests.service';
import { CreateSupportRequestDto, ResolveSupportRequestDto } from './dto/platform.dto';
import { SupportRequestStatus } from './entities/support-request.entity';

@ApiTags('platform')
@Controller('support-requests')
export class SupportRequestsController {
  constructor(private readonly service: SupportRequestsService) {}

  /**
   * Public: a hospital asks for a creation code, support or general contact.
   * Deliberately unguarded — it is the front door before anyone has an account.
   */
  @Post()
  @ApiOperation({ summary: 'Submit a code request / support / contact message' })
  create(@Body() dto: CreateSupportRequestDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'List inbound requests' })
  list(@Query('status') status?: SupportRequestStatus) {
    return this.service.list(status);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Resolve a request (and optionally email a reply)' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSupportRequestDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.resolve(id, dto, user.id);
  }
}
