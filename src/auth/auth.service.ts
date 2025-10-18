// src/auth/auth.service.ts - Updated with Email Service
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../common/services/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService, // ✅ Added
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(email: string, password: string, firstName: string, lastName: string, role: string = 'doctor') {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
    });

    const { password: _, ...result } = user;

    // ✅ Send welcome email (optional - doesn't throw error if it fails)
    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`
      );
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't fail registration if email fails
    }

    return result;
  }

  // ✅ UPDATED: Forgot Password - Generate reset token and send email
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      // Don't reveal if email exists for security
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token before storing (security best practice)
    const hashedToken = await bcrypt.hash(resetToken, 10);
    
    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save hashed token to database
    await this.usersService.setResetPasswordToken(email, hashedToken, expiresAt);

    // ✅ Send email with reset link
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        `${user.firstName} ${user.lastName}`
      );
      
      console.log('✅ Password reset email sent to:', user.email);
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      // Still return success message for security (don't reveal if email failed)
    }

    return { message: 'If the email exists, a reset link has been sent' };
  }

  // ✅ UPDATED: Reset Password - Validate token and update password
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    // Find user with valid reset token
    const user = await this.usersService.findByResetToken(token);
    
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.usersService.updatePassword(user.id, hashedPassword);

    // Clear reset token (single use)
    await this.usersService.clearResetToken(user.id);

    console.log('✅ Password reset successfully for user:', user.email);

    return { message: 'Password has been reset successfully' };
  }
}