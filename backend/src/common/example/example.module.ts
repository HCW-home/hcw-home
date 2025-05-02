import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { LoggerModule } from '../logger';

@Module({
  imports: [LoggerModule],
  controllers: [ExampleController]
})
export class ExampleModule {} 