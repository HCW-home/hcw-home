export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedApiResponse<T> {
  success: boolean;
  status: string;
  statusCode: number;
  message: string;
  data: {
    users: T[];
    total: number;
    page: number;
    limit: number;
  };
  timestamp: string;
  requestId: string;
  path: string;
}

export interface PaginationResult<T> {
  users: T[];
  total: number;
  page: number;
  limit: number;
}
