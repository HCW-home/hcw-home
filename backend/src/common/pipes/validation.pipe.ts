import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ValidationException } from '../exceptions';

@Injectable()
export class GlobalValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    // If no validation type is specified or the value is null, return as-is
    if (!metatype || !this.toValidate(metatype) || value === null) {
      return value;
    }

    // Convert plain objects to class instances
    const object = plainToClass(metatype, value);
    const errors = await validate(object, {
      whitelist: true, // Remove non-whitelisted properties
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties exist
      skipMissingProperties: false, // Validate all required properties
      validationError: { target: false }, // Don't include target in errors
    });

    if (errors.length > 0) {
      throw new ValidationException(errors);
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
} 