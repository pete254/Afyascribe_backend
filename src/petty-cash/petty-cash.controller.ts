import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserType } from '../common/decorators/current-user.decorator';
import { PettyCashService } from './petty-cash.service';
import { RecordExpenseDto, RecordTopUpDto } from './dto/petty-cash.dto';

function ctx(user: CurrentUserType): { facilityId: string; user: { id: string; name: string } } {
  if (!user.facilityId) throw new BadRequestException('Your account is not linked to a facility');
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  return { facilityId: user.facilityId, user: { id: user.id, name } };
}

/** Petty cash / imprest — the tin the facility runs small day-to-day payments from. */
@ApiTags('petty-cash')
@ApiBearerAuth('JWT-auth')
@Controller('petty-cash')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('cashier', 'accountant', 'facility_admin', 'super_admin')
export class PettyCashController {
  constructor(private readonly petty: PettyCashService) {}

  @Get('ledger')
  @ApiOperation({ summary: 'The petty-cash book: every voucher with a running float balance' })
  ledger(
    @CurrentUser() user: CurrentUserType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.petty.ledgerView(ctx(user).facilityId, from, to);
  }

  @Post('expense')
  @ApiOperation({ summary: 'Record a petty-cash payment (Dr expense, Cr petty cash)' })
  recordExpense(@CurrentUser() user: CurrentUserType, @Body() dto: RecordExpenseDto) {
    const c = ctx(user);
    return this.petty.recordExpense(c.facilityId, dto, c.user);
  }

  @Post('topup')
  @ApiOperation({ summary: 'Replenish the float (Dr petty cash, Cr source account)' })
  recordTopUp(@CurrentUser() user: CurrentUserType, @Body() dto: RecordTopUpDto) {
    const c = ctx(user);
    return this.petty.recordTopUp(c.facilityId, dto, c.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Reverse a voucher (voids its GL journal and removes it)' })
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.petty.remove(ctx(user).facilityId, id, user.id);
  }
}
