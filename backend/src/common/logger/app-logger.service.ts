import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService extends ConsoleLogger {
  /**
   * Creates a scoped logger instance with the given context name
   */
  constructor(context?: string) {
    // If context is undefined, pass an empty string instead
    super(context || 'Application');
  }

  /**
   * Logs a message with additional metadata
   */
  logWithMeta(message: string, meta: Record<string, any> = {}) {
    const metaString = Object.keys(meta).length ? ` - ${JSON.stringify(meta)}` : '';
    this.log(`${message}${metaString}`);
  }

  /**
   * Logs an error with additional metadata and optional stack trace
   */
  errorWithMeta(message: string, meta: Record<string, any> = {}, stack?: string) {
    const metaString = Object.keys(meta).length ? ` - ${JSON.stringify(meta)}` : '';
    this.error(`${message}${metaString}`, stack);
  }

  /**
   * Logs a warning with additional metadata
   */
  warnWithMeta(message: string, meta: Record<string, any> = {}) {
    const metaString = Object.keys(meta).length ? ` - ${JSON.stringify(meta)}` : '';
    this.warn(`${message}${metaString}`);
  }
} 