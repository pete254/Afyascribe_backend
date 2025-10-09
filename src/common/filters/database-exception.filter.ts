// src/common/filters/database-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error occurred';
    let error = 'Database Error';

    // Handle specific database errors
    const errorCode = (exception as any).code;

    switch (errorCode) {
      case '23505': // Unique constraint violation (PostgreSQL)
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists';
        error = 'Duplicate Entry';
        break;
      case '23503': // Foreign key violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced record does not exist';
        error = 'Foreign Key Violation';
        break;
      case '23502': // Not null violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Required field is missing';
        error = 'Missing Required Field';
        break;
      default:
        this.logger.error(
          `Unhandled database error: ${errorCode}`,
          exception.stack,
        );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
      message,
    });
  }
}