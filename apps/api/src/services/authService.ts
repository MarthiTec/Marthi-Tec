import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { createSecureToken, consumeSecureToken, inspectToken } from './tokenService.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from './emailService.js';
import { isPhoneVerified } from './otpService.js';

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

const defaultTestSalt = 'a1b2c3d4e5f6';
clientUsersStore.set('teste@marthi.com.br', {
  id: 'usr-teste-admin',
  email: 'teste@marthi.com.br',
  name: 'Administrador Marthi',
  passwordHash: hashPassword('123', defaultTestSalt),
  salt: defaultTestSalt,
  role: 'admin',
  clientAccountId: 'acc-matrix-demo',
  active: true,
  createdAt: new Date().toISOString(),
});

clientUsersStore.set('marthi.tecnologia@gmail.com', {
  id: 'usr-marthi-admin',
  email: 'marthi.tecnologia@gmail.com',
  name: 'Marthi Tecnologia',
  passwordHash: hashPassword('123', defaultTestSalt),
  salt: defaultTestSalt,
  role: 'admin',
  clientAccountId: 'acc-matrix-demo',
  active: true,
  createdAt: new Date().toISOString(),
});

export function upsertClientUserInMemory(
  email: string,
  name: string,
  password: string,
  role = 'operator',
  clientAccountId?: string,
) {
  const norm = email.trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password.trim(), salt);
  const existing = clientUsersStore.get(norm);
  clientUsersStore.set(norm, {
    id: existing?.id || `usr-${Date.now().toString(36)}`,
    email: norm,
    name: name.trim(),
    passwordHash,
    salt,
    role,
    clientAccountId: clientAccountId || existing?.clientAccountId || 'ACC-MARTHI-DEMO',
    active: true,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
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
    let match = hashPassword(password, stored.salt) === stored.passwordHash;
    if (match) {
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

/**
 * Validação rigorosa dos requisitos de segurança da senha
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Senha é obrigatória.' };
  }
  if (password.length < 6) {
    return { valid: false, reason: 'A senha deve conter no mínimo 6 caracteres.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: 'A senha deve conter ao menos uma letra.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'A senha deve conter ao menos um número.' };
  }
  return { valid: true };
}

/**
 * Pré-cadastra uma conta de usuário sem senha ativa (aguardando ativação por link seguro)
 */
export async function preRegisterClientAccount(input: {
  email: string;
  name: string;
  tradeName?: string;
  clientAccountId?: string;
  role?: string;
}): Promise<StoredUser> {
  const email = input.email.trim().toLowerCase();
  const id = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const role = input.role || 'admin';

  // Usamos salt aleatório e hash bloqueado até que o cliente defina sua senha no link seguro
  const salt = randomBytes(16).toString('hex');
  const dummyHash = 'LOCKED_PENDING_ACTIVATION';

  const userRecord: StoredUser = {
    id,
    email,
    name: input.name.trim(),
    passwordHash: dummyHash,
    salt,
    role,
    clientAccountId: input.clientAccountId,
    active: false, // Inativo até pagamento confirmado e senha criada
    createdAt: new Date().toISOString(),
  };

  clientUsersStore.set(email, userRecord);

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
         VALUES ($1, $2, $3, $4, 'password', $5, $6, false)
         ON CONFLICT (email) DO UPDATE
         SET name = $4, active = false`,
        [
          id,
          input.clientAccountId || `acc-${Date.now().toString(36)}`,
          email,
          input.name.trim(),
          `${salt}:${dummyHash}`,
          role,
        ],
      );
    } catch (err) {
      console.warn('[authService] DB pre-register fallback to memory store:', err);
    }
  }

  return userRecord;
}

/**
 * Define a senha inicial do cliente usando o token de ativação seguro recebido por e-mail
 */
export async function setupPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<{ success: boolean; session?: AuthSession; message: string }> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new Error(strength.reason || 'Senha fraca.');
  }

  const consumption = await consumeSecureToken(token, 'activation');
  if (!consumption.success || !consumption.record) {
    throw new Error(consumption.reason || 'Token de ativação inválido ou expirado.');
  }

  const email = consumption.record.email.trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(newPassword, salt);

  // Update in memory
  let user = clientUsersStore.get(email);
  if (user) {
    user.passwordHash = passwordHash;
    user.salt = salt;
    user.active = true;
  } else {
    user = {
      id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      email,
      name: consumption.record.name || 'Cliente Marthi',
      passwordHash,
      salt,
      role: 'admin',
      clientAccountId: consumption.record.clientId,
      active: true,
      createdAt: new Date().toISOString(),
    };
    clientUsersStore.set(email, user);
  }

  // Update in DB
  if (pool) {
    try {
      await pool.query(
        `UPDATE users
         SET password_hash = $1, active = true
         WHERE lower(email) = lower($2)`,
        [`${salt}:${passwordHash}`, email],
      );
    } catch (err) {
      console.warn('[authService] DB password setup update fallback:', err);
    }
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: null,
    provider: 'password',
    role: user.role,
    clientAccountId: user.clientAccountId,
  };

  const sessionToken = await createSessionToken(authUser);
  return {
    success: true,
    session: { token: sessionToken, user: authUser },
    message: 'Senha configurada com sucesso! Bem-vindo ao sistema.',
  };
}

/**
 * Solicitação segura de recuperação de senha com proteção contra enumeração de contas
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const normEmail = email.trim().toLowerCase();
  const genericMessage = 'Caso o e-mail informado esteja cadastrado no sistema, enviamos as instruções e o link seguro para redefinição de senha.';

  // Verifica se o usuário existe em memória ou no DB
  let userName = '';
  let exists = false;

  const inMem = clientUsersStore.get(normEmail);
  if (inMem) {
    exists = true;
    userName = inMem.name;
  } else if (pool) {
    try {
      const res = await pool.query('SELECT name, active FROM users WHERE lower(email) = $1', [normEmail]);
      if (res.rows.length > 0) {
        exists = true;
        userName = res.rows[0].name;
      }
    } catch {
      // ignore
    }
  }

  // Se o usuário existir, gera token e envia e-mail em background
  if (exists) {
    try {
      const { rawToken } = await createSecureToken({
        type: 'password_reset',
        email: normEmail,
        name: userName,
        ttlHours: 2,
      });

      await sendPasswordResetEmail({
        toEmail: normEmail,
        userName: userName || 'Cliente',
        resetToken: rawToken,
      });
      console.log(`[authService] E-mail de redefinição de senha despachado para ${normEmail}`);
    } catch (err) {
      console.error(`[authService] Erro ao enviar e-mail de recuperação:`, err);
    }
  } else {
    console.log(`[authService] Pedido de redefinição para e-mail não cadastrado (${normEmail}) — resposta neutra enviada.`);
  }

  return {
    success: true,
    message: genericMessage,
  };
}

/**
 * Redefine a senha com o token seguro de redefinição
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new Error(strength.reason || 'Senha fraca.');
  }

  const consumption = await consumeSecureToken(token, 'password_reset');
  if (!consumption.success || !consumption.record) {
    throw new Error(consumption.reason || 'Token de recuperação inválido ou expirado.');
  }

  const email = consumption.record.email.trim().toLowerCase();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(newPassword, salt);

  const inMem = clientUsersStore.get(email);
  if (inMem) {
    inMem.passwordHash = passwordHash;
    inMem.salt = salt;
  }

  if (pool) {
    try {
      await pool.query(
        `UPDATE users
         SET password_hash = $1
         WHERE lower(email) = lower($2)`,
        [`${salt}:${passwordHash}`, email],
      );
    } catch (err) {
      console.warn('[authService] DB password reset update fallback:', err);
    }
  }

  return {
    success: true,
    message: 'Sua senha foi redefinida com sucesso! Você já pode realizar o login.',
  };
}

/**
 * Ações Administrativas de Segurança (Painel /admin)
 */
export async function adminResendActivationLink(
  email: string,
  clientName: string,
  planName: string,
  actorName: string,
): Promise<{ success: boolean; message: string }> {
  const normEmail = email.trim().toLowerCase();
  const { rawToken } = await createSecureToken({
    type: 'activation',
    email: normEmail,
    name: clientName,
    ttlHours: 48,
  });

  await sendWelcomeEmail({
    toEmail: normEmail,
    contactName: clientName,
    companyName: clientName,
    planName: planName || 'Plano Marthi',
    activationToken: rawToken,
  });

  console.log(`[auditLog] [${actorName}] Reenviou link de ativação para ${normEmail}`);
  return {
    success: true,
    message: `Link de ativação reenviado com sucesso para ${normEmail}.`,
  };
}

export async function adminForcePasswordReset(
  email: string,
  clientName: string,
  actorName: string,
): Promise<{ success: boolean; message: string }> {
  const normEmail = email.trim().toLowerCase();
  const { rawToken } = await createSecureToken({
    type: 'password_reset',
    email: normEmail,
    name: clientName,
    ttlHours: 2,
  });

  await sendPasswordResetEmail({
    toEmail: normEmail,
    userName: clientName,
    resetToken: rawToken,
  });

  console.log(`[auditLog] [${actorName}] Forçou envio de redefinição de senha para ${normEmail}`);
  return {
    success: true,
    message: `E-mail de redefinição de senha enviado para ${normEmail}.`,
  };
}

export async function adminToggleUserAccess(
  email: string,
  active: boolean,
  actorName: string,
): Promise<{ success: boolean; message: string }> {
  const normEmail = email.trim().toLowerCase();
  const user = clientUsersStore.get(normEmail);
  if (user) {
    user.active = active;
  }

  if (pool) {
    try {
      await pool.query('UPDATE users SET active = $1 WHERE lower(email) = lower($2)', [active, normEmail]);
    } catch {
      // fallback
    }
  }

  console.log(`[auditLog] [${actorName}] Alterou status de acesso do usuário ${normEmail} para ${active ? 'ATIVO' : 'BLOQUEADO'}`);
  return {
    success: true,
    message: `Acesso do usuário ${active ? 'ativado' : 'bloqueado'} com sucesso.`,
  };
}

export function getUserSecurityStatus(email: string, phone?: string): {
  configured: boolean;
  active: boolean;
  phoneVerified: boolean;
} {
  const normEmail = email.trim().toLowerCase();
  const user = clientUsersStore.get(normEmail);
  const configured = Boolean(user && user.passwordHash && user.passwordHash !== 'LOCKED_PENDING_ACTIVATION');
  const active = Boolean(user ? user.active : false);
  const phoneVerified = phone ? isPhoneVerified(phone) : false;

  return { configured, active, phoneVerified };
}
