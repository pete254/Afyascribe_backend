// src/auth/auth.service.ts - UPDATED WITH 6-DIGIT CODE METHODS
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../common/services/email.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly CODE_EXPIRY_MINUTES = 10;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
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

    // Send welcome email (optional - doesn't throw error if it fails)
    try {
      await this.emailService.sendWelcomeEmail(
        user.email,
        `${user.firstName} ${user.lastName}`
      );
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    return result;
  }

  // ✅ NEW: Request 6-digit reset code
  async requestResetCode(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      // Don't reveal if email exists for security
      return { message: 'If the email exists, a reset code has been sent' };
    }

    // Generate 6-digit code
    const resetCode = this.generateSixDigitCode();
      console.log('===========================================');
      console.log(`🔐 PASSWORD RESET CODE FOR: ${email}`);
      console.log(`📧 Code: ${resetCode}`);
      console.log('===========================================');
    
    // Code expires in 10 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.CODE_EXPIRY_MINUTES);

    // Save code to database
    await this.usersService.setResetCode(email, resetCode, expiresAt);

    // Send email with code
    try {
      await this.emailService.sendResetCodeEmail(
        user.email,
        resetCode,
        `${user.firstName} ${user.lastName}`
      );
    } catch (error) {
      console.error('Failed to send reset code email:', error);
      throw new BadRequestException('Failed to send reset code email');
    }

    return { message: 'If the email exists, a reset code has been sent' };
  }

  // ✅ NEW: Verify 6-digit reset code
  async verifyResetCode(email: string, code: string): Promise<{ valid: boolean; message: string }> {
    const user = await this.usersService.findByEmailWithResetCode(email);

    if (!user) {
      return { valid: false, message: 'Invalid or expired reset code' };
    }

    // Check if max attempts exceeded
    if (user.resetCodeAttempts >= this.MAX_ATTEMPTS) {
      await this.usersService.clearResetCode(user.id);
      return { 
        valid: false, 
        message: 'Maximum attempts exceeded. Please request a new code' 
      };
    }

    // Check if code matches
    if (user.resetCode !== code) {
      // Increment attempts
      const attempts = await this.usersService.incrementResetCodeAttempts(user.id);
      const remainingAttempts = this.MAX_ATTEMPTS - attempts;
      
      return { 
        valid: false, 
        message: `Invalid code. ${remainingAttempts} attempt(s) remaining` 
      };
    }

    // Code is valid
    return { 
      valid: true, 
      message: 'Code verified successfully' 
    };
  }

  // ✅ NEW: Reset password with 6-digit code
  async resetPasswordWithCode(
    email: string, 
    code: string, 
    newPassword: string
  ): Promise<{ message: string }> {
    // Verify the code first
    const verification = await this.verifyResetCode(email, code);
    
    if (!verification.valid) {
      throw new BadRequestException(verification.message);
    }

    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.usersService.updatePassword(user.id, hashedPassword);

    // Clear reset code
    await this.usersService.clearResetCode(user.id);

    return { message: 'Password reset successfully' };
  }

  // Helper: Generate 6-digit code
  private generateSixDigitCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}