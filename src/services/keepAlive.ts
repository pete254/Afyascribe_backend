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
  private readonly BACKEND_URL = 'https://afyascribe-backend.onrender.com/';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Only run keep-alive in production (on Render)
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    
    if (isProduction) {
      this.startKeepAlive();
    } else {
      this.logger.log('Keep-alive disabled in development environment');
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
        this.httpService.get(this.BACKEND_URL, {
          timeout: 30000, // 30 second timeout
        })
      );
      this.logger.log(`✅ Ping successful - Status: ${response.status}`);
    } catch (error: any) {
      this.logger.error(`❌ Ping failed: ${error?.message || 'Unknown error'}`);
    }
  }
}