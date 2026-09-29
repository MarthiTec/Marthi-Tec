import {
  getMarthiStaffDemoCredentials,
  matchesMarthiStaffLogin,
} from '../data/marthiStaff';
import {
  listMarthiClients,
  verifyClientLogin,
} from '../data/marthiClientsStore';
import { nestApiUrl } from './config';
import { readJson } from './http';

const API_URL = nestApiUrl();
const MARTHI_STAFF_TOKEN_PREFIX = 'marthi-staff-local:';
const MARTHI_CLIENT_TOKEN_PREFIX = 'marthi-client-token:';

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
      role: 'admin',
    },
  };
}

export function isLocalMarthiStaffToken(token: string | null | undefined) {
  return Boolean(token?.startsWith(MARTHI_STAFF_TOKEN_PREFIX));
}

export function isClientUserToken(token: string | null | undefined) {
  return Boolean(token?.startsWith(MARTHI_CLIENT_TOKEN_PREFIX));
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
  const normEmail = email.trim().toLowerCase();

  // 1. Staff Marthi (operações internas)
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

  // 2. Real API login
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
    const json = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if (response.status === 403) {
      throw new Error(json?.error?.message || 'Conta inativa ou aguardando confirmação de pagamento.');
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes('aguardando') || err.message.includes('inativa'))) {
      throw err;
    }
  }

  // 3. Verificação de clientes cadastrados no sistema (sai do mock)
  const clientAuth = verifyClientLogin(normEmail, password);
  if (clientAuth) {
    const { client } = clientAuth;
    if (client.status === 'blocked') {
      throw new Error('Acesso bloqueado por falta de pagamento. Entre em contato com a equipe Marthi.');
    }
    if (client.status === 'inactive' || !client.paymentOk) {
      throw new Error(
        'Acesso pendente: O pagamento da assinatura ainda não foi confirmado ou identificado pelo administrador.',
      );
    }

    const session: AuthSession = {
      token: `${MARTHI_CLIENT_TOKEN_PREFIX}${client.clientId}:${Date.now().toString(36)}`,
      user: {
        id: `client:${client.clientId}`,
        email: client.email,
        name: client.tradeName,
        picture: null,
        provider: 'password',
        role: 'admin',
      },
    };
    return session;
  }

  throw new Error('E-mail ou senha inválidos.');
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
  if (isClientUserToken(token)) {
    const parts = token.slice(MARTHI_CLIENT_TOKEN_PREFIX.length).split(':');
    const clientId = parts[0];
    const client = listMarthiClients().find((c) => c.clientId === clientId);
    if (client) {
      return {
        id: `client:${client.clientId}`,
        email: client.email,
        name: client.tradeName,
        picture: null,
        provider: 'password',
        role: 'admin',
      };
    }
  }
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseAuth<{ success: true; data: { user: AuthUser } }>(response);
  return json.data.user;
}

export { SEED_LOGIN_HINT } from './http';
