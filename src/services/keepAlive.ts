// src/services/keep-alive.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
  /**
   * Render's free tier sleeps an idle service; pinging itself keeps it awake.
   * Render sets RENDER_EXTERNAL_URL on every service, so its presence is how we
   * know we are on Render. Anywhere else — the VPS — there is nothing to keep
   * awake, and a server pinging a stale address every five minutes is noise.
   */
  private readonly BACKEND_URL = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/`
    : null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Only on Render, where an idle service is put to sleep.
    if (this.BACKEND_URL) {
      this.startKeepAlive();
    } else {
      this.logger.log('Keep-alive off — not running on Render');
    }
  }

  onModuleDestroy() {
    this.stopKeepAlive();
  }

  private startKeepAlive(): void {
    this.logger.log(`🚀 Starting keep-alive pings every ${this.PING_INTERVAL / 60000} minutes`);
    
    // Ping immediately on start
    this.pingBackend();
    
    // Then ping at regular intervals
    this.intervalId = setInterval(() => {
      this.pingBackend();
    }, this.PING_INTERVAL);
  }

  private stopKeepAlive(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('🛑 Keep-alive pings stopped');
    }
  }

  private async pingBackend(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.BACKEND_URL!, {
          timeout: 30000, // 30 second timeout
        })
      );
      this.logger.log(`✅ Ping successful - Status: ${response.status}`);
    } catch (error: any) {
      this.logger.error(`❌ Ping failed: ${error?.message || 'Unknown error'}`);
    }
  }
}