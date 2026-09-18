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

async function parseJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T | ApiErrorBody;
  if (!response.ok || (json as ApiErrorBody).success === false) {
    const message =
      (json as ApiErrorBody).error?.message ?? `Falha na autenticação (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const response = await fetch(`${API_URL}/api/v1/auth/providers`);
  const json = await parseJson<{ success: true; data: AuthProviders }>(response);
  return json.data;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await parseJson<{ success: true; data: AuthSession }>(response);
  return json.data;
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/api/v1/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const json = await parseJson<{ success: true; data: AuthSession }>(response);
  return json.data;
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseJson<{ success: true; data: { user: AuthUser } }>(response);
  return json.data.user;
}
