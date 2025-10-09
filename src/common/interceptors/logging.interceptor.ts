// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Log request
    this.logger.log(`➡️  ${method} ${url} - ${userAgent}`);
    
    if (Object.keys(body).length > 0) {
      // Don't log sensitive data like passwords
      const sanitizedBody = { ...body };
      if (sanitizedBody.password) {
        sanitizedBody.password = '***';
      }
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - startTime;
          this.logger.log(
            `⬅️  ${method} ${url} ${response.statusCode} - ${responseTime}ms`
          );
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `❌ ${method} ${url} ${error.status || 500} - ${responseTime}ms - ${error.message}`
          );
        },
      }),
    );
  }
}