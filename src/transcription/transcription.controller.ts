import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import fetch from 'node-fetch';
const FormData = require('form-data');

@ApiTags('transcription')
@Controller('transcription')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TranscriptionController {
  private readonly logger = new Logger(TranscriptionController.name);
  private readonly GROQ_API_KEY = process.env.GROQ_API_KEY;

  @Post('transcribe')
  @ApiOperation({ summary: 'Transcribe audio to text using Groq Whisper' })
  @ApiResponse({ status: 200, description: 'Audio transcribed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid audio data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async transcribe(@Body() body: { audioBase64: string; platform: string }) {
    const startTime = Date.now();
    
    try {
      this.logger.log('📥 Received transcription request');
      this.logger.log(`📱 Platform: ${body.platform}`);

      if (!this.GROQ_API_KEY) {
        this.logger.error('❌ GROQ_API_KEY not configured');
        throw new Error('GROQ_API_KEY not configured in environment');
      }

      if (!body.audioBase64) {
        throw new Error('audioBase64 is required');
      }

      // Convert base64 to Buffer
      const audioBuffer = Buffer.from(body.audioBase64, 'base64');
      this.logger.log(`📊 Audio buffer size: ${audioBuffer.length} bytes (${(audioBuffer.length / 1024).toFixed(2)} KB)`);

      // Create FormData for Groq API
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'recording.m4a',
        contentType: body.platform === 'ios' ? 'audio/x-m4a' : 'audio/m4a',
      });
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append(
        'prompt',
        'Medical consultation with patient. Include medical terminology, SOAP notes format, symptoms, diagnosis, assessment, and treatment plan details.',
      );
      formData.append('response_format', 'text');

      this.logger.log('📤 Sending to Groq Whisper API...');

      // Call Groq API
      const response = await fetch(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.GROQ_API_KEY}`,
            ...formData.getHeaders(),
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`❌ Groq API error: ${errorText}`);
        throw new Error(`Groq API failed: ${response.status} - ${errorText}`);
      }

      const transcriptionText = await response.text();
      const duration = Date.now() - startTime;
      
      this.logger.log('✅ Transcription completed successfully');
      this.logger.log(`📝 Transcription length: ${transcriptionText.length} characters`);
      this.logger.log(`⏱️  Total time: ${duration}ms`);

      return {
        text: transcriptionText,
        success: true,
        duration: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Transcription failed after ${duration}ms:`, error.message);
      throw error;
    }
  }
}