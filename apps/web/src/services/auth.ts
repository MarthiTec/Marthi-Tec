import { nestApiUrl } from './config';
import { readJson } from './http';

const API_URL = nestApiUrl();

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
  role?: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type AuthProviders = {
  google: boolean;
  password: boolean;
  googleClientId: string | null;
};

type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

async function parseAuth<T>(response: Response): Promise<T> {
  const json = await readJson<T | ApiErrorBody>(response);
  if (!response.ok || (json as ApiErrorBody).success === false) {
    const message =
      (json as ApiErrorBody).error?.message ?? `Falha na autenticação (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const response = await fetch(`${API_URL}/api/v1/auth/providers`);
  const json = await parseAuth<{ success: true; data: AuthProviders }>(response);
  return json.data;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (response.ok) {
      const json = await parseAuth<{ success: true; data: AuthSession }>(response);
      return json.data;
    }
    const json = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if (json?.error?.message) {
      throw new Error(json.error.message);
    }
    if (response.status === 403) {
      throw new Error('Conta inativa ou aguardando confirmação de pagamento.');
    }
    if (response.status === 401) {
      throw new Error('E-mail ou senha inválidos.');
    }
    throw new Error('E-mail ou senha inválidos.');
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
        throw new Error('Bloqueio de conexão/CORS com a API. Adicione o domínio nas variáveis CORS_ORIGINS do backend.');
      }
      throw err;
    }
    throw new Error('E-mail ou senha inválidos.');
  }
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/api/v1/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const json = await parseAuth<{ success: true; data: AuthSession }>(response);
  return json.data;
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseAuth<{ success: true; data: { user: AuthUser } }>(response);
  return json.data.user;
}

export { SEED_LOGIN_HINT } from './http';
