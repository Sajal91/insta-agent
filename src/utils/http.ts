import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodError } from 'zod';

/** Wrap an async route handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Format a ZodError into a compact { field: message } list for API responses. */
export function formatZodError(err: ZodError): { error: string; issues: unknown } {
  return {
    error: 'Validation failed',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}
