import { apiV1Url } from './config';
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  storeId?: string | null;
  signal?: AbortSignal;
};

/**
 * Cliente HTTPS da API Marthi. Sempre Bearer + x-store-id quando houver loja ativa.
 * Não embute secrets; token vem do SecureStore.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.storeId) headers.set('x-store-id', options.storeId);

  const url = path.startsWith('http') ? path : `${apiV1Url()}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const json = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | ApiErrorBody
    | null;

  if (!response.ok || !json || (json as ApiErrorBody).success === false) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.message ?? `Falha na API (${response.status})`,
      err?.code ?? 'HTTP_ERROR',
      response.status,
    );
  }

  return (json as { success: true; data: T }).data;
}
