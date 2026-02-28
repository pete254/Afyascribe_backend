// src/auth/auth.controller.ts
// UPDATED: Added register-with-invite and validate-invite-code endpoints
import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetCodeDto } from './dto/request-reset-code.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';
import { UseInviteCodeDto } from '../facilities/dto/use-invite-code.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  // ── REGISTER WITH INVITE CODE (primary staff sign-up flow) ────────────────

  @Post('register')
  @ApiOperation({
    summary: 'Register a new staff account using a facility invite code',
    description:
      'Staff enter the 8-character invite code from their facility admin, ' +
      'plus their personal details. The code automatically links them to the correct facility.',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created and logged in',
    schema: {
      example: {
        access_token: 'eyJ...',
        user: {
          id: 'uuid',
          email: 'john.doe@knh.go.ke',
          firstName: 'John',
          lastName: 'Doe',
          role: 'doctor',
          facilityId: 'uuid',
          facilityCode: 'KNH',
          facilityName: 'Kenyatta National Hospital',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired invite code' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: UseInviteCodeDto) {
    return this.authService.registerWithInviteCode(dto);
  }

  // ── VALIDATE INVITE CODE (call before showing sign-up form) ───────────────

  @Get('validate-invite/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if an invite code is valid',
    description:
      'Call this when the user enters their code on the landing screen. ' +
      'Returns facility name so you can show "You are joining: Kenyatta National Hospital"',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        facilityId: 'uuid',
        facilityName: 'Kenyatta National Hospital',
        facilityCode: 'KNH',
      },
    },
  })
  async validateInviteCode(@Param('code') code: string) {
    return this.authService.validateInviteCode(code);
  }

  // ── PASSWORD RESET ─────────────────────────────────────────────────────────

  @Post('request-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a 6-digit password reset code' })
  async requestResetCode(@Body() dto: RequestResetCodeDto) {
    return this.authService.requestResetCode(dto.email);
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a 6-digit reset code' })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto.email, dto.code);
  }

  @Post('reset-password-with-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using verified 6-digit code' })
  async resetPasswordWithCode(@Body() dto: ResetPasswordWithCodeDto) {
    return this.authService.resetPasswordWithCode(dto.email, dto.code, dto.newPassword);
  }
}