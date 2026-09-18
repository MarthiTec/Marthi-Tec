import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        details: err.flatten(),
      },
    });
    return;
  }

  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
      ? err.status
      : 500;

  const message = err instanceof Error ? err.message : 'Erro interno do servidor.';
  const details =
    typeof err === 'object' && err !== null && 'details' in err
      ? (err as { details: unknown }).details
      : {};

  if (status >= 500) {
    console.error('[marthi-api] unhandled error:', err);
  }

  res.status(status).json({
    success: false,
    error: {
      code: status === 401 ? 'UNAUTHORIZED' : status === 501 ? 'NOT_IMPLEMENTED' : 'INTERNAL_ERROR',
      message: status >= 500 && status !== 502 ? 'Erro interno do servidor.' : message,
      details: details ?? {},
    },
  });
}
