// Chayan Das <01chayandas@gmail.com>

import { Request } from 'express';
import { UserResponseDto } from 'src/user/dto/user-response.dto';

export interface ExtendedRequest extends Request {
  id?: string; // request ID, typically set by a middleware
  user?: UserResponseDto; // user information, can be null if not authenticated
  // Add any other properties , if you need to extend the Request object
}
