/**
 * Structured logger for FHIR serverless functions
 * Provides consistent logging format across all Lambda functions
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  [key: string]: any;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLogLevel) {
      case 'DEBUG':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'INFO':
        this.logLevel = LogLevel.INFO;
        break;
      case 'WARN':
        this.logLevel = LogLevel.WARN;
        break;
      case 'ERROR':
        this.logLevel = LogLevel.ERROR;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
  }

  private log(level: LogLevel, levelName: string, message: string, meta?: Record<string, any>): void {
    if (level > this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      ...meta,
    };

    // Add AWS Lambda context if available
    if (process.env.AWS_REQUEST_ID) {
      logEntry.requestId = process.env.AWS_REQUEST_ID;
    }

    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      logEntry.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    }

    console.log(JSON.stringify(logEntry));
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, 'WARN', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, 'INFO', message, meta);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, meta);
  }

  /**
   * Log FHIR-specific operations with PHI handling considerations
   */
  fhirOperation(operation: string, resourceType: string, resourceId?: string, meta?: Record<string, any>): void {
    this.info(`FHIR ${operation}`, {
      resourceType,
      resourceId: resourceId ? this.maskResourceId(resourceId) : undefined,
      ...meta,
    });
  }

  /**
   * Log audit events for PHI access
   */
  auditLog(event: string, userId?: string, resourceType?: string, resourceId?: string, meta?: Record<string, any>): void {
    this.info('AUDIT', {
      event,
      userId,
      resourceType,
      resourceId: resourceId ? this.maskResourceId(resourceId) : undefined,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  }

  /**
   * Mask resource IDs for logging to prevent PHI exposure
   */
  private maskResourceId(resourceId: string): string {
    if (resourceId.length <= 4) {
      return '***';
    }
    return resourceId.substring(0, 4) + '***';
  }
}

export const logger = new Logger();