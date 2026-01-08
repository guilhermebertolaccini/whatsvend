import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';

@Injectable()
export class AppLoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, traceId, ...meta }) => {
              const contextStr = context ? `[${context}]` : '';
              const traceStr = traceId ? `[${traceId}]` : '';
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} ${level} ${contextStr} ${traceStr} ${message} ${metaStr}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
      ],
    });
  }

  log(message: string, context?: string, meta?: any) {
    if (meta) {
      this.logger.info(message, { context, ...meta });
    } else if (context) {
      this.logger.info(message, { context });
    } else {
      this.logger.info(message);
    }
  }

  error(message: string, trace?: string, context?: string, meta?: any) {
    if (meta) {
      this.logger.error(message, { context, trace, ...meta });
    } else if (trace && context) {
      this.logger.error(message, { context, trace });
    } else if (context) {
      this.logger.error(message, { context });
    } else {
      this.logger.error(message);
    }
  }

  warn(message: string, context?: string, meta?: any) {
    if (meta) {
      this.logger.warn(message, { context, ...meta });
    } else if (context) {
      this.logger.warn(message, { context });
    } else {
      this.logger.warn(message);
    }
  }

  debug(message: string, context?: string, meta?: any) {
    if (meta) {
      this.logger.debug(message, { context, ...meta });
    } else if (context) {
      this.logger.debug(message, { context });
    } else {
      this.logger.debug(message);
    }
  }

  verbose(message: string, context?: string, meta?: any) {
    if (meta) {
      this.logger.verbose(message, { context, ...meta });
    } else if (context) {
      this.logger.verbose(message, { context });
    } else {
      this.logger.verbose(message);
    }
  }

  /**
   * Log estruturado com traceId para rastreamento
   */
  logWithTrace(
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose',
    message: string,
    traceId: string,
    context?: string,
    meta?: any,
  ) {
    const logData = { ...meta, traceId };
    this[level](message, context, logData);
  }
}

