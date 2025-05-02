import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when domain/business rules are violated.
 * This represents errors in the business logic, not technical errors.
 */
export class BusinessException extends HttpException {
  constructor(
    message: string, 
    statusCode: number = HttpStatus.BAD_REQUEST,
    objectOrError?: string | object | any,
  ) {
    super(
      HttpException.createBody(
        objectOrError,
        message,
        statusCode,
      ),
      statusCode,
    );
  }
} 