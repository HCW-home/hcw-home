export function successResponse<T>(
    data: T,
    message = 'Success',
    statusCode = 200,
  ) {
    return {
      statusCode,
      message,
      data,
    };
  }
  
  export function errorResponse(
    message = 'Something went wrong',
    statusCode = 500,
  ) {
    return {
      statusCode,
      message,
    };
  }
  