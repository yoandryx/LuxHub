// src/lib/monitoring/errorHandler.ts
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import crypto from 'crypto';

interface ErrorContext {
  endpoint?: string;
  method?: string;
  userId?: string;
  walletAddress?: string;
  requestId?: string;
  extra?: Record<string, unknown>;
}

type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  context?: ErrorContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Centralized error monitoring class.
 * Designed to be easily extended with external services (Sentry, DataDog, etc.)
 */
class ErrorMonitor {
  private static instance: ErrorMonitor;
  private isDevelopment: boolean;

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor();
    }
    return ErrorMonitor.instance;
  }

  /**
   * Generate a unique request ID for tracking
   */
  generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * Log a structured message
   */
  private log(entry: LogEntry): void {
    const output = {
      ...entry,
      service: 'luxhub-api',
      environment: process.env.NODE_ENV || 'development',
    };

    // In production, you might send this to a logging service
    // For now, we use structured console logging
    if (entry.level === 'error' || entry.level === 'critical') {
      console.error(JSON.stringify(output, null, this.isDevelopment ? 2 : 0));
    } else if (entry.level === 'warning') {
      console.warn(JSON.stringify(output, null, this.isDevelopment ? 2 : 0));
    } else {
      console.log(JSON.stringify(output, null, this.isDevelopment ? 2 : 0));
    }

    // Sentry integration placeholder
    // if (process.env.SENTRY_DSN && entry.level === 'error') {
    //   Sentry.captureMessage(entry.message, { extra: entry.context });
    // }
  }

  /**
   * Capture and log an exception
   */
  captureException(error: Error, context?: ErrorContext): string {
    const requestId = context?.requestId || this.generateRequestId();

    this.log({
      level: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId,
      context,
      error: {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      },
    });

    // Sentry integration placeholder
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureException(error, {
    //     extra: context,
    //     tags: { requestId },
    //   });
    // }

    return requestId;
  }

  /**
   * Capture a message with context
   */
  captureMessage(message: string, level: LogLevel = 'info', context?: ErrorContext): void {
    const requestId = context?.requestId || this.generateRequestId();

    this.log({
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId,
      context,
    });
  }

  /**
   * Log API request for monitoring
   */
  logRequest(req: NextApiRequest, requestId: string, extra?: Record<string, unknown>): void {
    this.log({
      level: 'info',
      message: `API Request: ${req.method} ${req.url}`,
      timestamp: new Date().toISOString(),
      requestId,
      context: {
        endpoint: req.url,
        method: req.method,
        extra,
      },
    });
  }

  /**
   * Log API response for monitoring
   */
  logResponse(statusCode: number, requestId: string, durationMs: number): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warning' : 'info';

    this.log({
      level,
      message: `API Response: ${statusCode} (${durationMs}ms)`,
      timestamp: new Date().toISOString(),
      requestId,
      context: {
        extra: { statusCode, durationMs },
      },
    });
  }
}

export const errorMonitor = ErrorMonitor.getInstance();

/**
 * Middleware wrapper that provides automatic error capture and request tracking.
 * Adds requestId to response for debugging.
 */
export function withErrorMonitoring(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const requestId = errorMonitor.generateRequestId();
    const startTime = Date.now();

    // Add request ID to response headers
    res.setHeader('X-Request-Id', requestId);

    try {
      // Log incoming request in development
      if (process.env.NODE_ENV === 'development') {
        errorMonitor.logRequest(req, requestId);
      }

      const result = await handler(req, res);

      // Log response
      const durationMs = Date.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        errorMonitor.logResponse(res.statusCode, requestId, durationMs);
      }

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));

      errorMonitor.captureException(errorObj, {
        endpoint: req.url,
        method: req.method,
        requestId,
      });

      // Don't expose internal errors in production
      const isDevelopment = process.env.NODE_ENV === 'development';

      return res.status(500).json({
        success: false,
        error: isDevelopment ? errorObj.message : 'Internal server error',
        requestId,
        ...(isDevelopment && { stack: errorObj.stack }),
      });
    }
  };
}

/**
 * Create a custom error with additional context
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error factory functions
 */
export const errors = {
  badRequest: (message: string) => new AppError(message, 400, 'BAD_REQUEST'),
  unauthorized: (message: string = 'Unauthorized') => new AppError(message, 401, 'UNAUTHORIZED'),
  forbidden: (message: string = 'Forbidden') => new AppError(message, 403, 'FORBIDDEN'),
  notFound: (message: string = 'Not found') => new AppError(message, 404, 'NOT_FOUND'),
  conflict: (message: string) => new AppError(message, 409, 'CONFLICT'),
  tooManyRequests: (message: string = 'Too many requests') =>
    new AppError(message, 429, 'TOO_MANY_REQUESTS'),
  internal: (message: string = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR'),
  serviceUnavailable: (message: string = 'Service unavailable') =>
    new AppError(message, 503, 'SERVICE_UNAVAILABLE'),
};
