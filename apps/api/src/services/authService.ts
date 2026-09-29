import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
  role?: string;
  clientAccountId?: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: string;
  clientAccountId?: string;
  active: boolean;
  createdAt: string;
};

const clientUsersStore = new Map<string, StoredUser>();

const textEncoder = new TextEncoder();

function getJwtSecret() {
  return textEncoder.encode(env.JWT_SECRET);
}

export function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    role: user.role ?? 'admin',
    clientAccountId: user.clientAccountId ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getJwtSecret());

  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Token inválido.');
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : payload.email,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    provider: payload.provider === 'google' ? 'google' : 'password',
    role: typeof payload.role === 'string' ? payload.role : 'operator',
    clientAccountId: typeof payload.clientAccountId === 'string' ? payload.clientAccountId : undefined,
  };
}

export async function registerClientUser(input: {
  email: string;
  password: string;
  name: string;
  tradeName?: string;
  clientAccountId?: string;
  role?: string;
}): Promise<AuthSession> {
  const email = input.email.trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(input.password, salt);
  const role = input.role || 'admin';
  const id = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Store in PostgreSQL users table if available
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
         VALUES ($1, $2, $3, $4, 'password', $5, $6, true)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = $5, name = $4, active = true`,
        [
          id,
          input.clientAccountId || `acc-${Date.now().toString(36)}`,
          email,
          input.name.trim(),
          `${salt}:${passwordHash}`,
          role,
        ],
      );
    } catch (err) {
      console.warn('[authService] DB user upsert fallback to memory store:', err);
    }
  }

  // Always keep in persistent in-memory map
  clientUsersStore.set(email, {
    id,
    email,
    name: input.name.trim(),
    passwordHash,
    salt,
    role,
    clientAccountId: input.clientAccountId,
    active: true,
    createdAt: new Date().toISOString(),
  });

  const user: AuthUser = {
    id,
    email,
    name: input.name.trim(),
    picture: null,
    provider: 'password',
    role,
    clientAccountId: input.clientAccountId,
  };

  const token = await createSessionToken(user);
  return { token, user };
}

export function activateStoredClientUser(email: string): boolean {
  const norm = email.trim().toLowerCase();
  const stored = clientUsersStore.get(norm);
  if (stored) {
    stored.active = true;
    return true;
  }
  return false;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const normEmail = email.trim().toLowerCase();

  // 1. Check in PostgreSQL database if pool is active
  if (pool) {
    try {
      const res = await pool.query(
        'SELECT id, client_account_id, email, name, password_hash, global_role, active FROM users WHERE lower(email) = $1',
        [normEmail],
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (!row.active) {
          const error = new Error('Conta de cliente inativa ou aguardando confirmação de pagamento.');
          (error as Error & { status: number }).status = 403;
          throw error;
        }

        const storedHash: string = row.password_hash || '';
        let match = false;
        if (storedHash.includes(':')) {
          const [salt, hash] = storedHash.split(':');
          match = hashPassword(password, salt) === hash;
        } else {
          match = storedHash === password;
        }

        if (match) {
          const user: AuthUser = {
            id: row.id,
            email: row.email,
            name: row.name,
            picture: null,
            provider: 'password',
            role: row.global_role,
            clientAccountId: row.client_account_id,
          };
          return {
            token: await createSessionToken(user),
            user,
          };
        }
      }
    } catch (err) {
      console.warn('[authService] DB user lookup failed, checking client memory store:', err);
    }
  }

  // 2. Check registered client users store
  const stored = clientUsersStore.get(normEmail);
  if (stored) {
    if (!stored.active) {
      const error = new Error('Conta de cliente inativa ou aguardando identificação de pagamento.');
      (error as Error & { status: number }).status = 403;
      throw error;
    }
    const computed = hashPassword(password, stored.salt);
    if (computed === stored.passwordHash) {
      const user: AuthUser = {
        id: stored.id,
        email: stored.email,
        name: stored.name,
        picture: null,
        provider: 'password',
        role: stored.role,
        clientAccountId: stored.clientAccountId,
      };
      return {
        token: await createSessionToken(user),
        user,
      };
    }
  }

  // 3. Check dev / staff login fallback
  const expectedEmail = env.AUTH_DEV_EMAIL;
  const expectedPassword = env.AUTH_DEV_PASSWORD;
  if (expectedEmail && expectedPassword && normEmail === expectedEmail.toLowerCase() && password === expectedPassword) {
    const user: AuthUser = {
      id: `password:${expectedEmail.toLowerCase()}`,
      email: expectedEmail.toLowerCase(),
      name: 'Marthi Teste Staff',
      picture: null,
      provider: 'password',
      role: 'admin',
    };
    return {
      token: await createSessionToken(user),
      user,
    };
  }

  const error = new Error('E-mail ou senha inválidos.');
  (error as Error & { status: number }).status = 401;
  throw error;
}

export async function loginWithGoogleIdToken(idToken: string): Promise<AuthSession> {
  if (!env.GOOGLE_CLIENT_ID) {
    const error = new Error('Google login não configurado. Defina GOOGLE_CLIENT_ID no servidor.');
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    const error = new Error('Token Google inválido.');
    (error as Error & { status: number }).status = 401;
    throw error;
  }

  if (payload.email_verified === false) {
    const error = new Error('E-mail Google não verificado.');
    (error as Error & { status: number }).status = 401;
    throw error;
  }

  const user: AuthUser = {
    id: `google:${payload.sub}`,
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
    provider: 'google',
  };

  return {
    token: await createSessionToken(user),
    user,
  };
}
