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
  async transcribe(
    @Body() body: { audioBase64: string; platform: string; mimeType?: string },
  ) {
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

      // Label the upload with the recorder's actual container. The web recorder
      // produces webm/ogg/mp4 — if we mislabel it as m4a, ffmpeg on Groq's side
      // can't decode it and Whisper hallucinates "Thank you." on the silence.
      // Native (iOS/Android) clients keep sending m4a via the platform fallback.
      const mimeType: string =
        body.mimeType || (body.platform === 'ios' ? 'audio/x-m4a' : 'audio/m4a');
      const ext = mimeType.includes('webm')
        ? 'webm'
        : mimeType.includes('ogg')
          ? 'ogg'
          : mimeType.includes('mp4') || mimeType.includes('m4a')
            ? 'm4a'
            : mimeType.includes('wav')
              ? 'wav'
              : mimeType.includes('mpeg') || mimeType.includes('mp3')
                ? 'mp3'
                : 'webm';

      this.logger.log(`🎙️  Audio mime: ${mimeType} → recording.${ext}`);

      // Create FormData for Groq API
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: `recording.${ext}`,
        contentType: mimeType,
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

  // ── AI proofreading (spelling & grammar) ────────────────────────────────────
  // Reuses the configured Groq key (OpenAI-compatible chat API) to proofread a
  // clinical text field: returns the corrected text plus a list of individual
  // suggestions the clinician can accept one by one, Grammarly-style. Medical
  // terms and drug names are preserved.
  @Post('proofread')
  @ApiOperation({ summary: 'Proofread clinical text for spelling & grammar (Groq LLM)' })
  async proofread(@Body() body: { text: string; section?: string }) {
    const text = (body?.text ?? '').trim();
    if (!text) return { corrected: '', issues: [] };
    if (!this.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured in environment');

    // Which part of the SOAP note this is, so the model calibrates its
    // expectations (a Management field is drugs/doses/instructions; Symptoms is
    // patient-reported complaints; Diagnosis is disease names, etc.).
    const section = (body?.section ?? '').trim().slice(0, 80);
    const sectionLine = section
      ? `This text is the "${section}" section of a clinical SOAP note; judge whether each word fits what that section usually contains. `
      : '';

    const system =
      'You are a proofreading assistant for medical notes that were dictated and ' +
      'transcribed by speech-to-text, so expect mis-heard words that are spelled ' +
      'correctly but wrong in context (homophones, garbled drug or medical terms, ' +
      'e.g. "hypotension" heard as "hypertension"). ' +
      sectionLine +
      'Do two things:\n' +
      '1. Fix clear spelling, grammar and punctuation mistakes.\n' +
      '2. Flag words or phrases that do not make sense in the clinical context or ' +
      'look like transcription errors, and suggest the most probable intended term.\n' +
      'Safety rules: NEVER change numbers, dosages, units or measurements. NEVER ' +
      'invent clinical findings or add/remove content. When unsure, flag it as a ' +
      'suggestion rather than silently changing it. Preserve line breaks.\n' +
      'Respond with STRICT JSON only, no prose: {"corrected": "<the text with ONLY ' +
      'the confident spelling/grammar/punctuation fixes applied — do NOT bake in ' +
      'context/meaning guesses here>", "issues": [{"original": "<exact substring ' +
      'from the input>", "suggestion": "<replacement>", "reason": "<short>", "type": ' +
      '"spelling" | "grammar" | "context"}]}. Context/transcription guesses go in ' +
      'issues (type "context") only, never in corrected. If nothing is wrong, ' +
      'return the text unchanged with an empty issues array.';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`❌ Groq proofread error: ${errorText}`);
      throw new Error(`Proofread failed: ${response.status}`);
    }

    const data: any = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    try {
      const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .filter((i: any) => i && i.original && i.suggestion && i.original !== i.suggestion)
            .slice(0, 50)
            .map((i: any) => {
              const type = ['spelling', 'grammar', 'context'].includes(i.type) ? i.type : 'spelling';
              return {
                original: String(i.original),
                suggestion: String(i.suggestion),
                reason: String(i.reason ?? 'Correction'),
                type,
              };
            })
        : [];
      return { corrected: typeof parsed.corrected === 'string' ? parsed.corrected : text, issues };
    } catch (e) {
      this.logger.error(`❌ Proofread parse error: ${(e as Error).message}`);
      // Fall back to no-op rather than failing the request.
      return { corrected: text, issues: [] };
    }
  }
}