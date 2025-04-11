import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Set global prefix for all routes
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  
  // Only enable Swagger in development mode
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    const config = new DocumentBuilder()
      .setTitle('Backend API')
      .setDescription('The NestJS API documentation')
      .setVersion('1.0')
      .addTag('api')
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
    
    console.log(`Swagger documentation available at: http://localhost:${port}/api-docs`);
  }

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();