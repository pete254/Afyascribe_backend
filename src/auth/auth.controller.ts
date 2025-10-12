// src/auth/auth.controller.ts 
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  @ApiResponse({
    status: 400,
    description: 'Validation error'
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
  @ApiResponse({
    status: 400,
    description: 'Validation error'
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

  // ✅ NEW: Forgot Password endpoint
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Request password reset',
    description: 'Send password reset link to user email. Returns success message even if email doesn\'t exist (security best practice).'
  })
  @ApiResponse({
    status: 200,
    description: 'Reset link sent (if email exists)',
    schema: {
      example: {
        message: 'If the email exists, a reset link has been sent'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error'
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // ✅ NEW: Reset Password endpoint
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Reset password with token',
    description: 'Reset user password using the token from email. Token expires in 1 hour and can only be used once.'
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: 'Password has been reset successfully'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token'
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword
    );
  }
}