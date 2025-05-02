import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = request.url;
    const timestamp = new Date().toISOString();

    // Prepare error response with defaults
    const errorResponse: ErrorResponse = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      path,
      timestamp,
    };

    // Handle different types of exceptions
    if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      
      errorResponse.statusCode = status;
      errorResponse.error = exceptionResponse.error || HttpStatus[status];
      
      if (typeof exceptionResponse === 'string') {
        errorResponse.message = exceptionResponse;
      } else if (exceptionResponse.message) {
        errorResponse.message = exceptionResponse.message;
      }

      // Log detailed info for client errors (4xx)
      if (status >= 400 && status < 500) {
        this.logger.warn(`Client Error: ${status} - ${JSON.stringify({
          path,
          method: request.method,
          message: errorResponse.message,
          body: request.body,
        })}`);
      }
    } else {
      // Handle unexpected errors
      const error = exception as Error;
      
      // Log internal server errors with stack trace
      this.logger.error(
        `Internal Server Error: ${error.message || 'Unknown error'}`,
        error.stack,
        `${request.method} ${path}`,
      );
      
      // Sanitize error message for production
      if (process.env.NODE_ENV === 'production') {
        errorResponse.message = 'An unexpected error occurred';
      } else {
        errorResponse.message = error.message || 'Unknown error';
      }
    }

    // Send consistent error response
    response.status(errorResponse.statusCode).json(errorResponse);
  }
} 