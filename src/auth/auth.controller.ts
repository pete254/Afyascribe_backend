// src/auth/auth.controller.ts - UPDATED WITH 6-DIGIT CODE ENDPOINTS
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestResetCodeDto } from './dto/request-reset-code.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Login user',
    description: 'Authenticate user with email and password. Returns JWT token and user information.'
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 'uuid',
          email: 'doctor@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'doctor'
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials'
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('register')
  @ApiOperation({ 
    summary: 'Register new user',
    description: 'Create a new user account. Default role is "doctor" if not specified.'
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: {
      example: {
        id: 'uuid',
        email: 'doctor@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'doctor',
        isActive: true,
        createdAt: '2025-01-15T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists'
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.firstName,
      registerDto.lastName,
      registerDto.role,
    );
  }

  // ✅ NEW: Request 6-digit reset code
  @Post('request-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Request 6-digit password reset code',
    description: 'Send a 6-digit reset code to user email. Code expires in 10 minutes with 5 max attempts.'
  })
  @ApiResponse({
    status: 200,
    description: 'Reset code sent successfully',
    schema: {
      example: {
        message: 'If the email exists, a reset code has been sent'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format'
  })
  async requestResetCode(@Body() requestResetCodeDto: RequestResetCodeDto) {
    return this.authService.requestResetCode(requestResetCodeDto.email);
  }

  // ✅ NEW: Verify 6-digit reset code
  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify 6-digit reset code',
    description: 'Validate the reset code before allowing password reset. Returns whether code is valid.'
  })
  @ApiResponse({
    status: 200,
    description: 'Code verification result',
    schema: {
      example: {
        valid: true,
        message: 'Code verified successfully'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid code format'
  })
  async verifyResetCode(@Body() verifyResetCodeDto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(
      verifyResetCodeDto.email,
      verifyResetCodeDto.code
    );
  }

  // ✅ NEW: Reset password with 6-digit code
  @Post('reset-password-with-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Reset password using 6-digit code',
    description: 'Reset user password using verified 6-digit code. Code must be valid and not expired.'
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: 'Password reset successfully'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid code or password requirements not met'
  })
  async resetPasswordWithCode(@Body() resetPasswordDto: ResetPasswordWithCodeDto) {
    return this.authService.resetPasswordWithCode(
      resetPasswordDto.email,
      resetPasswordDto.code,
      resetPasswordDto.newPassword
    );
  }
}