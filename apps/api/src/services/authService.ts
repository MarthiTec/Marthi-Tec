import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

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

const textEncoder = new TextEncoder();

function getJwtSecret() {
  return textEncoder.encode(env.JWT_SECRET);
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
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
  };
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const expectedEmail = env.AUTH_DEV_EMAIL;
  const expectedPassword = env.AUTH_DEV_PASSWORD;

  if (!expectedEmail || !expectedPassword) {
    const error = new Error(
      'Login por e-mail ainda não está habilitado. Configure AUTH_DEV_EMAIL e AUTH_DEV_PASSWORD ou use o Google.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  if (email.trim().toLowerCase() !== expectedEmail.toLowerCase() || password !== expectedPassword) {
    const error = new Error('E-mail ou senha inválidos.');
    (error as Error & { status: number }).status = 401;
    throw error;
  }

  const user: AuthUser = {
    id: `password:${expectedEmail.toLowerCase()}`,
    email: expectedEmail.toLowerCase(),
    name: expectedEmail.split('@')[0] ?? 'Usuário',
    picture: null,
    provider: 'password',
  };

  return {
    token: await createSessionToken(user),
    user,
  };
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
