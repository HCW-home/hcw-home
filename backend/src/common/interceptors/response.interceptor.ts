// interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../helpers/response/api-response.dto';
ApiResponseDto;
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const res = ctx.getResponse();


    const requestId = request['id'];
    const path = request.url;

    return next.handle().pipe(
      map((data) => {
        if (data instanceof ApiResponseDto) {
          data.requestId = data.requestId || requestId;
          data.path = data.path || path;
          return data;
        }
        return {
          data,
          requestId,
          path,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
