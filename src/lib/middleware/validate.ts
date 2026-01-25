// src/lib/middleware/validate.ts
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { z, ZodSchema, ZodError } from 'zod';

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

function formatZodError(error: ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}

/**
 * Validates request body against a Zod schema.
 * Returns 400 with structured errors if validation fails.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return function bodyValidationMiddleware(handler: NextApiHandler): NextApiHandler {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        req.body = schema.parse(req.body);
        return handler(req, res);
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: formatZodError(error),
          });
        }
        throw error;
      }
    };
  };
}

/**
 * Validates query parameters against a Zod schema.
 * Returns 400 with structured errors if validation fails.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return function queryValidationMiddleware(handler: NextApiHandler): NextApiHandler {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        // Query params are always strings, so the schema should handle coercion
        req.query = schema.parse(req.query) as typeof req.query;
        return handler(req, res);
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid query parameters',
            details: formatZodError(error),
          });
        }
        throw error;
      }
    };
  };
}

/**
 * Validates both body and query against schemas.
 */
export function validate<B, Q>(bodySchema: ZodSchema<B>, querySchema: ZodSchema<Q>) {
  return function combinedValidationMiddleware(handler: NextApiHandler): NextApiHandler {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const errors: ValidationError[] = [];

      try {
        req.body = bodySchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...formatZodError(error).map((e) => ({ ...e, field: `body.${e.field}` })));
        } else {
          throw error;
        }
      }

      try {
        req.query = querySchema.parse(req.query) as typeof req.query;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...formatZodError(error).map((e) => ({ ...e, field: `query.${e.field}` })));
        } else {
          throw error;
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
        });
      }

      return handler(req, res);
    };
  };
}

/**
 * Combines multiple middleware functions into a single handler.
 * Executes them in order, stopping on the first that sends a response.
 */
export function composeMiddleware(
  ...middlewares: Array<(handler: NextApiHandler) => NextApiHandler>
) {
  return function composedMiddleware(handler: NextApiHandler): NextApiHandler {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
  };
}
