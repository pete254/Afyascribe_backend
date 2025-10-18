// src/common/services/email.service.ts
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

    // Using Resend's default domain for now
    this.fromEmail = 'Afyascribe <onboarding@resend.dev>';
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName: string,
  ): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:19006';
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      const htmlContent = this.getPasswordResetTemplate(userName, resetLink, resetToken);

      this.logger.log(`📧 Sending password reset email to: ${to}`);

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: '🔐 Reset Your Afyascribe Password',
        html: htmlContent,
      });

      if (error) {
        throw new Error(error.message);
      }

      this.logger.log(`✅ Password reset email sent successfully. ID: ${data?.id}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send password reset email to ${to}:`, error);
      throw new Error('Failed to send password reset email');
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
      // Don't throw error for welcome emails - it's not critical
    }
  }

  /**
   * Password Reset Email Template
   */
  private getPasswordResetTemplate(userName: string, resetLink: string, token: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🏥 Afyascribe</h1>
                      <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 14px;">Medical SOAP Notes</p>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Reset Your Password</h2>
                      
                      <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Hi <strong>${userName}</strong>,
                      </p>
                      
                      <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        We received a request to reset your password for your Afyascribe account. Click the button below to create a new password:
                      </p>

                      <!-- Reset Button -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; background-color: #0f766e; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                              🔐 Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="color: #4b5563; font-size: 14px; line-height: 20px; margin: 20px 0;">
                        Or copy and paste this link into your browser:
                      </p>
                      
                      <p style="color: #0f766e; font-size: 14px; line-height: 20px; margin: 0 0 20px 0; word-break: break-all; background-color: #f3f4f6; padding: 12px; border-radius: 6px;">
                        ${resetLink}
                      </p>

                      <!-- Security Info Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px;">
                        <tr>
                          <td style="padding: 16px;">
                            <p style="color: #92400e; font-size: 14px; line-height: 20px; margin: 0;">
                              ⚠️ <strong>Security Notice:</strong> This link will expire in <strong>1 hour</strong> and can only be used once.
                            </p>
                          </td>
                        </tr>
                      </table>

                      <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 20px 0 0 0;">
                        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #6b7280; font-size: 12px; line-height: 18px; margin: 0 0 10px 0;">
                        This email was sent by Afyascribe Medical SOAP Notes
                      </p>
                      <p style="color: #9ca3af; font-size: 12px; line-height: 18px; margin: 0;">
                        © ${new Date().getFullYear()} Afyascribe. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Welcome Email Template
   */
  private getWelcomeTemplate(userName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Afyascribe</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🎉</h1>
                      <h2 style="color: #ffffff; margin: 10px 0 0 0; font-size: 24px;">Welcome to Afyascribe!</h2>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Hi <strong>${userName}</strong>,
                      </p>
                      
                      <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Thank you for joining Afyascribe! Your account has been successfully created.
                      </p>

                      <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        You can now start creating and managing medical SOAP notes efficiently.
                      </p>

                      <h3 style="color: #1f2937; font-size: 18px; margin: 30px 0 15px 0;">✨ Features Available:</h3>
                      
                      <ul style="color: #4b5563; font-size: 15px; line-height: 24px; margin: 0 0 20px 0; padding-left: 20px;">
                        <li>🎙️ Voice-to-text transcription</li>
                        <li>🤖 AI-powered note formatting</li>
                        <li>📋 Patient history tracking</li>
                        <li>💾 Secure cloud storage</li>
                        <li>📱 Mobile and web access</li>
                      </ul>

                      <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 30px 0 0 0;">
                        If you have any questions or need assistance, feel free to reach out to our support team.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #6b7280; font-size: 12px; line-height: 18px; margin: 0 0 10px 0;">
                        This email was sent by Afyascribe Medical SOAP Notes
                      </p>
                      <p style="color: #9ca3af; font-size: 12px; line-height: 18px; margin: 0;">
                        © ${new Date().getFullYear()} Afyascribe. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }
}