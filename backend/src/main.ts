import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { GlobalValidationPipe } from './common/pipes/validation.pipe';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // Create the NestJS application
  const app = await NestFactory.create(AppModule, {
    // Use native logger for startup messages
    logger: ['error', 'warn', 'log'],
  });
  
  // Create logger instance
  const logger = new Logger('Bootstrap');
  
  // Apply global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  // Apply global validation pipe
  app.useGlobalPipes(new GlobalValidationPipe());
  
  // Enable CORS for frontend applications
  app.enableCors();
  
  // Get port from environment or use default
  const port = process.env.PORT || 3000;
  
  // Start the server
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap().catch(err => {
  // Handle bootstrap errors
  console.error('Error during application bootstrap:', err);
  process.exit(1);
});