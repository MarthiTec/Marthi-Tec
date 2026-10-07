import { tenantScopedKey } from '../data/tenantContext';
import { getExplicitTotemStoreId } from '../data/totemContext';
import { nestApiUrl } from './config';
import { readJson } from './http';

const AUTH_TOKEN_KEY = 'marthi.auth.token';

export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)?.trim();
    if (!token || token === 'null' || token === 'undefined' || token === 'marthi-demo-token') {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isNestAuthed(): boolean {
  return Boolean(getAuthToken());
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

  const kioskStore = path.startsWith('/totem/') ? getExplicitTotemStoreId() : null;
  if (kioskStore && !headers.has('x-store-id')) headers.set('x-store-id', kioskStore);

  try {
    const key = tenantScopedKey('marthi.multi_store.active_store_id.v1');
    let activeStoreId = localStorage.getItem(key);
    const rawStores = localStorage.getItem(tenantScopedKey('marthi.multi_store.stores.v1'));
    if (rawStores) {
      try {
        const parsed = JSON.parse(rawStores);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!activeStoreId || !parsed.some((s: any) => s.id === activeStoreId && s.active !== false)) {
            const fallback = parsed.find((s: any) => s.isMatrix && s.active !== false) || parsed.find((s: any) => s.active !== false) || parsed[0];
            if (fallback?.id) {
              const resolvedId = String(fallback.id);
              activeStoreId = resolvedId;
              localStorage.setItem(key, resolvedId);
            }
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }
    if (activeStoreId && !headers.has('x-store-id')) {
      headers.set('x-store-id', activeStoreId);
    }
  } catch {
    // ignore
  }

  const selectedAtStart = headers.get('x-store-id');
  const hasExplicitStore = Boolean(kioskStore) || new Headers(init.headers).has('x-store-id');
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
  const json = await readJson<ApiOkBody<T> | ApiErrorBody>(response);

  if (!response.ok || (json as ApiErrorBody).success === false) {
    if (response.status === 401) {
      clearAuthToken();
    }
    const err = json as ApiErrorBody;
    throw new NestApiError(
      err.error?.message ?? `Falha na API (${response.status})`,
      err.error?.code ?? 'INTERNAL_ERROR',
      response.status,
    );
  }

  const selectedNow=localStorage.getItem(tenantScopedKey('marthi.multi_store.active_store_id.v1'));
  if(getAuthToken() !== token || (!hasExplicitStore && selectedAtStart && selectedNow !== selectedAtStart)) {
    throw new NestApiError('A sessão ou loja mudou durante a operação. Confira os registros da loja anterior antes de repetir.', 'STORE_CONTEXT_CHANGED', 409);
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
