// src/users/users.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post('deactivate')
  @ApiOperation({
    summary: 'Deactivate user account',
    description: 'Deactivate account. All data is preserved but user cannot login.'
  })
  @ApiResponse({ status: 200, description: 'Account deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  async deactivateAccount(
    @Request() req,
    @Body() deactivateDto: DeactivateAccountDto
  ) {
    // Verify password before deactivation
    const user = await this.authService.validateUser(
      req.user.email,
      deactivateDto.password
    );
    
    if (!user) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.usersService.deactivateAccount(
      req.user.userId,
      deactivateDto.reason
    );

    return {
      message: 'Account deactivated successfully',
      deactivatedAt: new Date(),
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }
}