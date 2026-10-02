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

  const isDbConnError =
    message.includes('getaddrinfo') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('connection timeout') ||
    message.includes('Connection terminated');

  if (status >= 500) {
    console.error('[marthi-api] unhandled error:', err);
  }

  const userFacingMessage = isDbConnError
    ? `Falha de conexão com o banco de dados PostgreSQL (${message}). Verifique as variáveis de conexão e a rede da Discloud.`
    : message || 'Erro interno do servidor.';

  res.status(status).json({
    success: false,
    error: {
      code: status === 401 ? 'UNAUTHORIZED' : isDbConnError ? 'DATABASE_UNAVAILABLE' : status === 501 ? 'NOT_IMPLEMENTED' : 'INTERNAL_ERROR',
      message: userFacingMessage,
      details: details ?? {},
    },
  });
}
