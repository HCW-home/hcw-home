import { ConsoleLogger, Injectable, LoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export type LogCategory = 'server-action' | 'user-action' | 'message';

export interface LogContext {
  category?: LogCategory;
  userId?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class CustomLoggerService extends ConsoleLogger implements LoggerService {
  private readonly logFormat: string;

  constructor(
    private readonly configService: ConfigService,
    context?: string,
  ) {
    super(context || 'CustomLogger');
    this.logFormat = this.configService.logFormat;
  }

  private formatSplunkMessage(
    level: string,
    message: string,
    context: LogContext = {},
  ): string {
    const { category = 'message', userId, ...extraContext } = context;

    const logEntry: Record<string, any> = {
      level,
      category,
      ts: new Date().toISOString(),
      caller: this.getCallerLocation(),
      message,
      ...extraContext,
    };

    if (userId) {
      logEntry.userId = userId;
    }

    return JSON.stringify(logEntry);
  }
  

  private shouldUseSplunkFormat(): boolean {
    return this.logFormat === 'splunk';
  }

  private logWithContext(
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose',
    message: string,
    context: LogContext = {},
  ) {
    if (this.shouldUseSplunkFormat()) {
      const formattedMessage = this.formatSplunkMessage(
        level.toUpperCase(),
        message,
        context,
      );
    } else {
      const contextString = this.context || context.category || 'Application';
      super[level](message, contextString);
    }
  }

  // Standard Logger overrides
  log(message: string, context?: LogContext | string) {
    if (typeof context === 'string') {
      this.logWithContext('log', message, { category: 'message' });
    } else {
      this.logWithContext('log', message, context);
    }
  }

  error(message: string, trace?: string, context?: LogContext | string) {
    const errorContext = typeof context === 'string' 
      ? { category: 'message' as LogCategory } 
      : context;
    
    const fullMessage = trace ? `${message} - ${trace}` : message;
    this.logWithContext('error', fullMessage, errorContext);
  }

  warn(message: string, context?: LogContext | string) {
    if (typeof context === 'string') {
      this.logWithContext('warn', message, { category: 'message' });
    } else {
      this.logWithContext('warn', message, context);
    }
  }

  debug(message: string, context?: LogContext | string) {
    if (typeof context === 'string') {
      this.logWithContext('debug', message, { category: 'message' });
    } else {
      this.logWithContext('debug', message, context);
    }
  }

  verbose(message: string, context?: LogContext | string) {
    if (typeof context === 'string') {
      this.logWithContext('verbose', message, { category: 'message' });
    } else {
      this.logWithContext('verbose', message, context);
    }
  }

  // Custom log methods
  logServerAction(message: string, additionalContext: Omit<LogContext, 'category'> = {}) {
    this.logWithContext('log', message, { 
      ...additionalContext, 
      category: 'server-action' 
    });
  }

  logUserAction(message: string, userId: string, additionalContext: Omit<LogContext, 'category' | 'userId'> = {}) {
    this.logWithContext('log', message, { 
      ...additionalContext, 
      category: 'user-action',
      userId 
    });
  }

  errorServerAction(message: string, trace?: string, additionalContext: Omit<LogContext, 'category'> = {}) {
    const fullMessage = trace ? `${message} - ${trace}` : message;
    this.logWithContext('error', fullMessage, { 
      ...additionalContext, 
      category: 'server-action' 
    });
  }

  errorUserAction(message: string, userId: string, trace?: string, additionalContext: Omit<LogContext, 'category' | 'userId'> = {}) {
    const fullMessage = trace ? `${message} - ${trace}` : message;
    this.logWithContext('error', fullMessage, { 
      ...additionalContext, 
      category: 'user-action',
      userId 
    });
  }

  private getCallerLocation(): string {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
  
    const err = new Error();
    const stack = err.stack as unknown as NodeJS.CallSite[];
  
    Error.prepareStackTrace = originalPrepareStackTrace;
  
    if (!stack) return 'unknown';
  
    const caller = stack.find((s) => {
      const file = s.getFileName();
      return file && !file.includes('logger') && !file.includes('node_modules');
    });
  
    if (!caller) return 'unknown';
  
    const fileName = caller.getFileName()?.split('/').slice(-2).join('/');
    const line = caller.getLineNumber();
    // const method = caller.getFunctionName() || 'anonymous';
  
    return `${fileName}:${line}`;
  }
}