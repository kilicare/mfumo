import { Injectable, ConsoleLogger } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService extends ConsoleLogger {
  private logger!: winston.Logger;

  constructor() {
    super();
    this.initializeLogger();
  }

  private initializeLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : ''
        }`;
      }),
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), logFormat),
        }),
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
        }),
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    super.log(message, context);
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    super.error(message, trace, context);
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    super.warn(message, context);
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    super.debug(message, context);
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    super.verbose(message, context);
    this.logger.info(message, { level: 'verbose', context });
  }
}
