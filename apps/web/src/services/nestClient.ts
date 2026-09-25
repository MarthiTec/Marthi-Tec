import { nestApiUrl } from './config';
import { readJson } from './http';

const AUTH_TOKEN_KEY = 'marthi.auth.token';

export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token && token !== 'marthi-demo-token' ? token : null;
  } catch {
    return null;
  }
}

export function isNestAuthed(): boolean {
  const token = getAuthToken();
  if (!token) return false;
  // Staff local / demo não são JWT Nest
  if (token.startsWith('marthi-staff-local:') || token === 'marthi-demo-token') {
    return false;
  }
  return true;
}

type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

type ApiOkBody<T> = { success: true; data: T };

function apiBase() {
  return `${nestApiUrl()}/api/v1`;
}

export class NestApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'NestApiError';
    this.code = code;
    this.status = status;
  }
}

export async function nestRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
  const json = await readJson<ApiOkBody<T> | ApiErrorBody>(response);

  if (!response.ok || (json as ApiErrorBody).success === false) {
    const err = json as ApiErrorBody;
    throw new NestApiError(
      err.error?.message ?? `Falha na API (${response.status})`,
      err.error?.code ?? 'INTERNAL_ERROR',
      response.status,
    );
  }

  return (json as ApiOkBody<T>).data;
}

export function nestGet<T>(path: string) {
  return nestRequest<T>(path);
}

export function nestPost<T>(path: string, body?: unknown) {
  return nestRequest<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function nestPut<T>(path: string, body?: unknown) {
  return nestRequest<T>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function nestPatch<T>(path: string, body?: unknown) {
  return nestRequest<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function nestDelete<T>(path: string) {
  return nestRequest<T>(path, { method: 'DELETE' });
}
