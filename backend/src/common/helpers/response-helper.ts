// Success Response
export function successResponse<T>(
    data: T,
    message = 'Success',
    statusCode = 200,
  ) {
    return {
      statusCode,
      success: true,
      message,
      data,
    };
  }
  
  // General Error Response (with optional error details)
  export function errorResponse(
    message = 'Something went wrong',
    error: any = null,
    statusCode = 500,
  ) {
    return {
      statusCode,
      success: false,
      message,
      error,
    };
  }
  
  // Validation Error
  export function validationErrorResponse(
    errors: Record<string, string[]>,
    message = 'Validation failed',
  ) {
    return {
      statusCode: 422,
      success: false,
      message,
      error: errors,
    };
  }
  
  // Unauthorized Access
  export function unauthorizedResponse(
    message = 'Unauthorized',
    error: any = null,
  ) {
    return {
      statusCode: 401,
      success: false,
      message,
      error,
    };
  }
  
  // Forbidden Access
  export function forbiddenResponse(
    message = 'Forbidden',
    error: any = null,
  ) {
    return {
      statusCode: 403,
      success: false,
      message,
      error,
    };
  }
  
  // Not Found
  export function notFoundResponse(
    message = 'Resource not found',
    error: any = null,
  ) {
    return {
      statusCode: 404,
      success: false,
      message,
      error,
    };
  }
  
  // Conflict
  export function conflictResponse(
    message = 'Conflict occurred',
    error: any = null,
  ) {
    return {
      statusCode: 409,
      success: false,
      message,
      error,
    };
  }
  