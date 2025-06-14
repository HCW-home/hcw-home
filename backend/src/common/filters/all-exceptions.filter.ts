import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomHttpException } from '../helpers/execption/http-exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = req['id'];
    const path = req.url;

    if (exception instanceof CustomHttpException) {
      exception.requestId = requestId;
      exception.path = path;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    return res.status(status).json({
      ...(typeof responseBody === 'object'
        ? responseBody
        : { message: responseBody }),
      requestId,
      path,
    });
  }
}
