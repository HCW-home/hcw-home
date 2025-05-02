import { IsEmail, IsNotEmpty, IsString, Length, IsOptional, IsNumber, Min, Max } from 'class-validator';

/**
 * Example DTO to demonstrate validation.
 * This is just for documentation purposes.
 */
export class ExampleDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(0, { message: 'Age cannot be negative' })
  @Max(120, { message: 'Age cannot exceed 120' })
  age?: number;
} 