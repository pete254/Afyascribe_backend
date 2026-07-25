import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformFacilitiesService } from './platform-facilities.service';
import {
  SendReminderDto,
  SetFacilityStatusDto,
  SetSubscriptionDto,
} from './dto/platform.dto';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('admin/facilities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class PlatformFacilitiesController {
  constructor(private readonly service: PlatformFacilitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all facilities with owner and billing state' })
  list() {
    return this.service.list();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Pause, deactivate or resume a facility' })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetFacilityStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Patch(':id/subscription')
  @ApiOperation({ summary: 'Set or clear the subscription due date' })
  setSubscription(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSubscriptionDto) {
    return this.service.setSubscription(id, dto.dueDate);
  }

  @Post(':id/send-reminder')
  @ApiOperation({ summary: 'Email a payment reminder to the facility' })
  sendReminder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendReminderDto) {
    return this.service.sendReminder(id, dto);
  }
}
