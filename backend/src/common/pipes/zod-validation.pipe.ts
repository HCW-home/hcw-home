import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../helpers/execption/http-exception.helper';
import { CustomHttpException } from '../helpers/execption/http-exception';
import { ZodSchema, ZodError } from 'zod';
import { ApiResponseDto } from '../helpers/response/api-response.dto';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private schema: ZodSchema,
    private options: { validateTypes?: ArgumentMetadata['type'][] } = {
      validateTypes: ['body', 'query', 'param'],
    },
  ) { }

  transform(value: any, metadata: ArgumentMetadata) {
    const typesToValidate = this.options.validateTypes || [
      'body',
      'query',
      'param',
    ];

    if (!typesToValidate.includes(metadata.type)) {
      return value;
    }

    try {
      if (value === undefined || value === null) {
        throw HttpExceptionHelper.badRequest('Request data is required');
      }

      const parsedValue = this.schema.parse(value);

      return parsedValue;
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: Record<string, string[]> = {};

        error.errors.forEach((err) => {
          const field = err.path.join('.') || 'root';
          validationErrors[field] = validationErrors[field] || [];
          validationErrors[field].push(err.message);
        });

        const response = ApiResponseDto.validationError(
          validationErrors,
          'Validation failed',
        );

        throw HttpExceptionHelper.badRequest('Validation failed');
      }

      // If error is already a custom HttpException, rethrow
      if (error instanceof CustomHttpException) {
        throw error;
      }

      throw HttpExceptionHelper.badRequest('Validation failed');
    }
  }
}
