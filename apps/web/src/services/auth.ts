import { DEMO_LOGIN, isDemoCredentials, isDemoToken, readJson } from './http';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
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

function demoSession(): AuthSession {
  return { token: DEMO_LOGIN.token, user: DEMO_LOGIN.user };
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/providers`);
    const json = await parseAuth<{ success: true; data: AuthProviders }>(response);
    return { ...json.data, password: true };
  } catch {
    return {
      google: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
      password: true,
      googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null,
    };
  }
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  if (isDemoCredentials(email, password)) {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return (await parseAuth<{ success: true; data: AuthSession }>(response)).data;
    } catch {
      return demoSession();
    }
  }

  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await parseAuth<{ success: true; data: AuthSession }>(response);
  return json.data;
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
  if (isDemoToken(token)) {
    return DEMO_LOGIN.user;
  }

  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseAuth<{ success: true; data: { user: AuthUser } }>(response);
  return json.data.user;
}
