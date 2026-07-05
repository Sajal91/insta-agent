import pino from 'pino';
import { config } from '../config/env';

/**
 * Central pino logger. In development we pretty-print; in production we emit
 * structured JSON (better for log aggregators).
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
