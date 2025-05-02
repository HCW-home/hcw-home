import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when a requested resource cannot be found.
 */
export class ResourceNotFoundException extends HttpException {
  constructor(
    resourceName: string, 
    identifier?: string | number,
  ) {
    const message = identifier
      ? `${resourceName} with identifier ${identifier} not found`
      : `${resourceName} not found`;
    
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message,
      },
      HttpStatus.NOT_FOUND,
    );
  }
} 