import { HttpException, HttpStatus, ValidationError } from '@nestjs/common';

/**
 * Exception thrown when request validation fails.
 */
export class ValidationException extends HttpException {
  constructor(
    validationErrors: ValidationError[],
  ) {
    // Format validation errors into a more readable structure
    const formattedErrors = formatValidationErrors(validationErrors);
    
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Validation Failed',
        message: Object.keys(formattedErrors).length 
          ? formattedErrors 
          : 'Invalid input data',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Formats the validation errors into a more readable object
 * with field names as keys and error messages as values.
 */
function formatValidationErrors(
  validationErrors: ValidationError[],
  parentField: string = '',
): Record<string, string[]> {
  return validationErrors.reduce((acc, error) => {
    const field = parentField 
      ? `${parentField}.${error.property}` 
      : error.property;
    
    if (error.constraints) {
      acc[field] = Object.values(error.constraints);
    }
    
    if (error.children && error.children.length > 0) {
      const childErrors = formatValidationErrors(error.children, field);
      Object.assign(acc, childErrors);
    }
    
    return acc;
  }, {} as Record<string, string[]>);
} 