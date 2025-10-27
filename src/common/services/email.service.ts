// src/common/services/email.service.ts - UPDATED WITH 6-DIGIT CODE EMAIL
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('⚠️ RESEND_API_KEY not configured. Email sending will fail.');
    } else {
      this.resend = new Resend(apiKey);
      this.logger.log('✅ Resend email service initialized');
    }

    this.fromEmail = 'Afyascribe <onboarding@resend.dev>';
  }

  /**
   * Send 6-digit reset code email
   */
  async sendResetCodeEmail(
    to: string,
    resetCode: string,
    userName: string,
  ): Promise<void> {
    try {
      const htmlContent = this.getResetCodeTemplate(userName, resetCode);

      this.logger.log(`📧 Sending reset code email to: ${to}`);

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: '🔐 Your Afyascribe Password Reset Code',
        html: htmlContent,
      });

      if (error) {
        throw new Error(error.message);
      }

      this.logger.log(`✅ Reset code email sent successfully. ID: ${data?.id}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send reset code email to ${to}:`, error);
      throw new Error('Failed to send reset code email');
    }
  }

  /**
   * Send welcome email (optional - for new user registration)
   */
  async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    try {
      const htmlContent = this.getWelcomeTemplate(userName);

      this.logger.log(`📧 Sending welcome email to: ${to}`);

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: '👋 Welcome to Afyascribe!',
        html: htmlContent,
      });

      if (error) {
        throw new Error(error.message);
      }

      this.logger.log(`✅ Welcome email sent successfully. ID: ${data?.id}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send welcome email to ${to}:`, error);
      // Don't throw - welcome email is not critical
    }
  }

  /**
   * Email template for 6-digit reset code
   */
  private getResetCodeTemplate(userName: string, resetCode: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 48px;
            margin-bottom: 10px;
          }
          h1 {
            color: #1e293b;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .code-container {
            background-color: #f1f5f9;
            border: 2px dashed #3b82f6;
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
          }
          .code {
            font-size: 36px;
            font-weight: bold;
            color: #1e293b;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
          }
          .info {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info p {
            margin: 5px 0;
            color: #92400e;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            background-color: #3b82f6;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🏥</div>
            <h1>Password Reset Request</h1>
          </div>

          <p>Hi ${userName},</p>
          
          <p>You requested to reset your password for your Afyascribe account. Use the code below to reset your password:</p>

          <div class="code-container">
            <div class="code">${resetCode}</div>
          </div>

          <div class="info">
            <p><strong>⏰ This code expires in 10 minutes</strong></p>
            <p><strong>🔒 You have 5 attempts to enter the correct code</strong></p>
          </div>

          <p>Enter this code in the app to proceed with resetting your password.</p>

          <p><strong>Didn't request this?</strong><br>
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

          <div class="footer">
            <p>This is an automated email from Afyascribe</p>
            <p>Please do not reply to this email</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Welcome email template
   */
  private getWelcomeTemplate(userName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 48px;
            margin-bottom: 10px;
          }
          h1 {
            color: #1e293b;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🏥</div>
            <h1>Welcome to Afyascribe!</h1>
          </div>
          <p>Hi ${userName},</p>
          <p>Thank you for joining Afyascribe. Your account has been created successfully.</p>
          <p>You can now start creating medical SOAP notes with voice transcription.</p>
          <p>Best regards,<br>The Afyascribe Team</p>
        </div>
      </body>
      </html>
    `;
  }
}