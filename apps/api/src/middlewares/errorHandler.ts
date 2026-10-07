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
    message.includes('Connection terminated') ||
    message.includes('ECONNRESET') ||
    message.includes('recovery mode') ||
    message.includes('Falha ao consultar MarthiDB') ||
    // 57P0x = banco reiniciando/desligando (ex.: "the database system is in recovery mode").
    (typeof err === 'object' && err !== null && /^57P0/.test(String((err as { code?: unknown }).code ?? '')));

  if (status >= 500) {
    console.error('[marthi-api] unhandled error:', err);
  }

  const userFacingMessage = status >= 500
    ? (isDbConnError || status === 503 ? 'O sistema está se reconectando. Aguarde alguns segundos e tente novamente.' : 'Erro interno do servidor.')
    : message || 'Erro interno do servidor.';

  res.status(status).json({
    success: false,
    error: {
      code: status === 401 ? 'UNAUTHORIZED' : isDbConnError ? 'DATABASE_UNAVAILABLE' : status === 501 ? 'NOT_IMPLEMENTED' : 'INTERNAL_ERROR',
      message: userFacingMessage,
      details: status >= 500 ? {} : details ?? {},
    },
  });
}
