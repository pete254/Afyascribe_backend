// src/common/filters/validation-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let validationErrors = [];

    if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
      const messages = exceptionResponse.message;
      
      if (Array.isArray(messages)) {
        validationErrors = messages;
      } else if (typeof messages === 'string') {
        validationErrors = [messages];
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      error: 'Validation Error',
      message: 'Validation failed',
      validationErrors,
    });
  }
}