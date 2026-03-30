import { ResponseStatus } from './response-status.enum';
import {
  IApiResponse,
  IPaginationMeta,
  IPaginatedResponse,
} from './response.interface';

export class ApiResponseDto<T> implements IApiResponse<T> {
  success: boolean;
  status: ResponseStatus;
  statusCode: number;
  message: string;
  data?: T;
  error?: any;
  timestamp: string;
  requestId?: string;
  path?: string;
  // Allow these for join endpoints (for controller serialization convenience)
  consultationId?: number;
  sessionUrl?: string;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    Object.assign(this, partial);
    this.timestamp = this.timestamp || new Date().toISOString();
    this.success = this.statusCode >= 200 && this.statusCode < 300;
  }

  static success<T>(
    data?: T,
    message = 'Operation completed successfully',
    statusCode = 200,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>({
      status: ResponseStatus.SUCCESS,
      message,
      statusCode,
      data,
      ...meta,
    });
  }

  static created<T>(
    data?: T,
    message = 'Resource created successfully',
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.success(data, message, 201, meta);
  }

  static noContent(
    message = 'Operation completed successfully',
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<null> {
    return ApiResponseDto.success(null, message, 204, meta);
  }

  static error<T>(
    message = 'An error occurred',
    statusCode = 500,
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>({
      status: ResponseStatus.ERROR,
      message,
      statusCode,
      error,
      ...meta,
    });
  }

  static badRequest<T>(
    message = 'Bad request',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 400, error, meta);
  }

  static unauthorized<T>(
    message = 'Unauthorized access',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 401, error, meta);
  }

  static forbidden<T>(
    message = 'Access forbidden',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 403, error, meta);
  }

  static notFound<T>(
    message = 'Resource not found',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 404, error, meta);
  }

  static conflict<T>(
    message = 'Resource conflict',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 409, error, meta);
  }

  static validationError<T>(
    errors: Record<string, string[]> | string[],
    message = 'Validation failed',
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(
      message,
      422,
      { validationErrors: errors },
      meta,
    );
  }

  static internalServerError<T>(
    message = 'Internal server error',
    error?: any,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return ApiResponseDto.error(message, 500, error, meta);
  }

  static warning<T>(
    message: string,
    data?: T,
    statusCode = 200,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>({
      status: ResponseStatus.WARNING,
      message,
      statusCode,
      data,
      ...meta,
    });
  }

  static info<T>(
    message: string,
    data?: T,
    statusCode = 200,
    meta?: { requestId?: string; path?: string },
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>({
      status: ResponseStatus.INFO,
      message,
      statusCode,
      data,
      ...meta,
    });
  }
}

export class PaginationMetaDto implements IPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;

  constructor(total: number, page: number, limit: number) {
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNextPage = page < this.totalPages;
    this.hasPreviousPage = page > 1;
  }
}

export class PaginatedApiResponseDto<T>
  extends ApiResponseDto<T[]>
  implements IPaginatedResponse<T> {
  pagination: PaginationMetaDto;

  constructor(partial: Partial<PaginatedApiResponseDto<T>>) {
    super(partial);
    if (partial.pagination) this.pagination = partial.pagination;
  }

  static paginatedSuccess<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    message = 'Items retrieved successfully',
    meta?: { requestId?: string; path?: string },
  ): PaginatedApiResponseDto<T> {
    const pagination = new PaginationMetaDto(total, page, limit);
    return new PaginatedApiResponseDto<T>({
      status: ResponseStatus.SUCCESS,
      message,
      statusCode: 200,
      data,
      pagination,
      ...meta,
    });
  }
}
