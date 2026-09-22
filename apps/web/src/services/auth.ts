import {
  getMarthiStaffDemoCredentials,
  matchesMarthiStaffLogin,
} from '../data/marthiStaff';
import { nestApiUrl } from './config';
import { readJson } from './http';

const API_URL = nestApiUrl();
const MARTHI_STAFF_TOKEN_PREFIX = 'marthi-staff-local:';

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

function issueLocalMarthiStaffSession(): AuthSession {
  const creds = getMarthiStaffDemoCredentials();
  return {
    token: `${MARTHI_STAFF_TOKEN_PREFIX}${creds.email}`,
    user: {
      id: `marthi-staff:${creds.email}`,
      email: creds.email,
      name: creds.name,
      picture: null,
      provider: 'password',
    },
  };
}

export function isLocalMarthiStaffToken(token: string | null | undefined) {
  return Boolean(token?.startsWith(MARTHI_STAFF_TOKEN_PREFIX));
}

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
  if (matchesMarthiStaffLogin(email, password)) {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        const json = await parseAuth<{ success: true; data: AuthSession }>(response);
        return json.data;
      }
    } catch {
      /* API indisponível — usa sessão local de staff */
    }
    return issueLocalMarthiStaffSession();
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
  if (isLocalMarthiStaffToken(token)) {
    return issueLocalMarthiStaffSession().user;
  }
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseAuth<{ success: true; data: { user: AuthUser } }>(response);
  return json.data.user;
}

export { SEED_LOGIN_HINT } from './http';
