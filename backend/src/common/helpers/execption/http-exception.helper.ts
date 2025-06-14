// Chayan Das <01chayandas@gmail.com>

import { HttpStatus } from '@nestjs/common';
import { CustomHttpException } from './http-exception';

export class HttpExceptionHelper {
  static notFound(
    message = 'Resource not found',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.NOT_FOUND,
      error,
      requestId,
      path,
    );
  }

  static unauthorized(
    message = 'Unauthorized',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.UNAUTHORIZED,
      error,
      requestId,
      path,
    );
  }

  static badRequest(
    message = 'Bad Request',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.BAD_REQUEST,
      error,
      requestId,
      path,
    );
  }

  static forbidden(
    message = 'Forbidden',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.FORBIDDEN,
      error,
      requestId,
      path,
    );
  }

  static internalServerError(
    message = 'Internal Server Error',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      error,
      requestId,
      path,
    );
  }
  static confilct(
    message = 'conflict ocure',
    requestId?: string,
    path?: string,
    error?: any,
  ) {
    return new CustomHttpException(
      message,
      HttpStatus.CONFLICT,
      error,
      requestId,
      path,
    );
  }
}
