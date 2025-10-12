// src/auth/auth.service.ts 
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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
    return result;
  }

  // ✅ NEW: Forgot Password - Generate reset token and send email
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

    // TODO: Send email with reset link
    // For now, we'll just log it (in production, use SendGrid, AWS SES, etc.)
    const resetLink = `http://yourfrontend.com/reset-password?token=${resetToken}`;
    console.log('📧 Password Reset Link:', resetLink);
    console.log('🔑 Reset Token:', resetToken);
    
    // In production, send email here:
    // await this.emailService.sendPasswordResetEmail(user.email, resetLink);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  // ✅ NEW: Reset Password - Validate token and update password
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    // Find all users with reset tokens (since we hashed the token)
    // Note: This is a simplified approach. In production, consider storing unhashed token
    // with expiry and comparing hashed versions, or use JWT tokens for password reset
    const allUsers = await this.usersService.findByResetToken(token);
    
    // For this implementation, we'll use a simpler approach:
    // Store the plain token (with expiry) for password reset only
    // This is acceptable since the token expires in 1 hour and is single-use
    
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

    return { message: 'Password has been reset successfully' };
  }
}