// src/common/interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message?: string;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((data) => ({
        statusCode,
        message: this.getSuccessMessage(request.method),
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }

  private getSuccessMessage(method: string): string {
    const messages = {
      GET: 'Data retrieved successfully',
      POST: 'Resource created successfully',
      PATCH: 'Resource updated successfully',
      PUT: 'Resource updated successfully',
      DELETE: 'Resource deleted successfully',
    };
    return messages[method] || 'Operation completed successfully';
  }
}