import { Controller, Get, Post, Body, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ExampleDto } from '../dto/example.dto';
import { BusinessException, ResourceNotFoundException } from '../exceptions';
import { AppLoggerService } from '../logger';

@Controller('example')
export class ExampleController {
  private readonly logger = new AppLoggerService(ExampleController.name);

  /**
   * Example endpoint to demonstrate successful response
   */
  @Get()
  findAll() {
    this.logger.log('Fetching all examples');
    return { 
      statusCode: 200, 
      message: 'Successfully retrieved examples',
      data: [
        { id: 1, name: 'Example 1' },
        { id: 2, name: 'Example 2' },
      ]
    };
  }

  /**
   * Example endpoint to demonstrate validation exception
   */
  @Post()
  create(@Body() createExampleDto: ExampleDto) {
    this.logger.logWithMeta('Creating example', { dto: createExampleDto });
    return { 
      statusCode: 201, 
      message: 'Example created successfully',
      data: { id: 3, ...createExampleDto }
    };
  }

  /**
   * Example endpoint to demonstrate resource not found exception
   */
  @Get('not-found')
  demonstrateNotFound() {
    throw new ResourceNotFoundException('Example', 123);
  }

  /**
   * Example endpoint to demonstrate business exception
   */
  @Get('business-error')
  demonstrateBusinessError() {
    throw new BusinessException('A business rule was violated');
  }

  /**
   * Example endpoint to demonstrate built-in NestJS exception
   */
  @Get('nest-exception')
  demonstrateNestException() {
    throw new NotFoundException('Resource not found using NestJS exception');
  }

  /**
   * Example endpoint to demonstrate internal server error
   */
  @Get('server-error')
  demonstrateServerError() {
    throw new InternalServerErrorException('Something went wrong on the server');
  }

  /**
   * Example endpoint to demonstrate unhandled error
   */
  @Get('unhandled-error')
  demonstrateUnhandledError() {
    this.logger.log('About to throw an unhandled error');
    // This will be caught by our global exception filter
    throw new Error('This is an unhandled error that will be caught globally');
  }
} 