import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);
}
