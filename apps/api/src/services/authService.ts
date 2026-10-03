import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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


const textEncoder = new TextEncoder();

function getJwtSecret() {
  return textEncoder.encode(env.JWT_SECRET);
}

export function hashPassword(password: string, salt: string): string {
  return 'scrypt$' + scryptSync(password, salt, 64).toString('hex');
}

export function upsertClientUserInMemory(..._args: unknown[]): never {
      throw new Error('Gravação em memória desativada. Salve o usuário no MarthiDB.');
    }

export async function createSessionToken(user: AuthUser): Promise<string> {
  const state = await pool.query('SELECT session_version FROM users WHERE id = $1 AND active = true', [user.id]);
  if (!state.rows[0]) throw Object.assign(new Error('Conta não autorizada.'), { status: 401 });
  return new SignJWT({
    sessionVersion: state.rows[0].session_version ?? 0,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    role: user.role ?? 'operator',
    clientAccountId: user.clientAccountId ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('marthi-api')
    .setAudience('marthi-web')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ['HS256'], issuer: 'marthi-api', audience: 'marthi-web', requiredClaims: ['sub', 'exp', 'iat'],
  });

  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Token inválido.');
  }

  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  let result;
  try {
    result = await pool.query('SELECT id, email, name, provider, global_role, client_account_id, active, session_version FROM users WHERE id = $1', [payload.sub]);
  } catch { throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 }); }
  const row = result.rows[0];
  if (!row?.active || payload.sessionVersion !== (row.session_version ?? 0)) throw Object.assign(new Error('Sessão inválida.'), { status: 401 });
  return { id: row.id, email: row.email, name: row.name, picture: null,
    provider: row.provider === 'google' ? 'google' : 'password',
    role: row.global_role, clientAccountId: row.client_account_id };

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
  const strength = validatePasswordStrength(input.password);
  if (!strength.valid) throw Object.assign(new Error(strength.reason), { status: 400 });
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
`,
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
      throw err;
    }
  }

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

export async function activateStoredClientUser(email: string): Promise<boolean> {
      if (!pool) throw new Error('MarthiDB indisponível.');
      const result = await pool.query('UPDATE users SET active = true WHERE lower(email) = $1 RETURNING id', [email.trim().toLowerCase()]);
      return Boolean(result.rowCount);
    }

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const normEmail = email.trim().toLowerCase();
  if (password.length < 6 || password === 'Marthi170926') throw Object.assign(new Error('E-mail ou senha inválidos. Redefina sua senha.'), { status: 401 });

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
          const calculated = hash.startsWith('scrypt$')
            ? hashPassword(password, salt)
            : createHash('sha256').update(salt + ':' + password).digest('hex');
          const actual = Buffer.from(calculated);
          const expected = Buffer.from(hash);
          match = actual.length === expected.length && timingSafeEqual(actual, expected);
          if (match && !hash.startsWith('scrypt$')) {
            const newSalt = randomBytes(16).toString('hex');
            await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newSalt + ':' + hashPassword(password, newSalt), row.id]);
          }
        } else {
          match = false;
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
      throw err;
    }
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

  if (payload.email_verified !== true) {
    const error = new Error('E-mail Google não verificado.');
    (error as Error & { status: number }).status = 401;
    throw error;
  }

  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const account = await pool.query('SELECT id, email, name, global_role, client_account_id FROM users WHERE lower(email) = $1 AND active = true AND provider = $2', [payload.email.toLowerCase(), 'google']);
  const row = account.rows[0];
  if (!row) throw Object.assign(new Error('Conta Google não autorizada.'), { status: 403 });
  const user: AuthUser = { id: row.id, email: row.email, name: row.name, picture: payload.picture || null,
    provider: 'google', role: row.global_role, clientAccountId: row.client_account_id };

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



  if (pool) {
    try {
      await pool.query(
        `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
         VALUES ($1, $2, $3, $4, 'password', $5, $6, false)
         ON CONFLICT (email) DO NOTHING`,
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
      throw err;
    }
  }

  return userRecord;
}

/**
 * Define a senha inicial do cliente usando o token de ativação seguro recebido por e-mail
 */
export async function setupPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; session?: AuthSession; message: string }> {
      await updatePasswordUsingToken(token, newPassword, 'activation');
      return { success: true, message: 'Senha configurada. Entre com seu e-mail e senha.' };
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

  if (pool) {
    try {
      const res = await pool.query('SELECT name, active FROM users WHERE lower(email) = $1', [normEmail]);
      if (res.rows.length > 0) {
        exists = true;
        userName = res.rows[0].name;
      }
    } catch (error) { throw error; }
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
 * Solicitação de Primeiro Acesso (Link de ativação e criação de senha inicial)
 */
export async function requestFirstAccess(email: string): Promise<{ success: boolean; message: string; activationUrl?: string }> {
  const normEmail = email.trim().toLowerCase();
  const genericMessage =
    'Se o e-mail informado estiver cadastrado, enviamos as instruções e o link seguro para você definir sua senha de primeiro acesso.';

  let userName = '';
  let exists = false;
  const companyName = 'Loja';
  const planName = 'Plano Marthi';

  // 2. Verifica no PostgreSQL
  if (pool) {
    try {
      const uRes = await pool.query("SELECT u.name FROM users u JOIN client_accounts c ON c.id = u.client_account_id WHERE lower(u.email) = $1 AND c.status = 'active' AND (u.password_hash IS NULL OR u.password_hash LIKE '%LOCKED_PENDING_ACTIVATION%')", [normEmail]);
      if (uRes.rows.length > 0) {
        exists = true;
        userName = uRes.rows[0].name || userName;
      }
    } catch (error) { throw error; }
  }

  if (!exists) return { success: true, message: genericMessage };
  let rawToken = '';
  try {
    const tokenResult = await createSecureToken({
      type: 'activation',
      email: normEmail,
      name: userName || 'Cliente Marthi',
      ttlHours: 48,
    });
    rawToken = tokenResult.rawToken;

    await sendWelcomeEmail({
      toEmail: normEmail,
      contactName: userName || 'Responsável',
      companyName: companyName,
      planName: planName,
      activationToken: rawToken,
    });
    console.log(`[authService] E-mail de primeiro acesso enviado para ${normEmail}`);
  } catch (err) {
    console.error(`[authService] Erro ao enviar e-mail de primeiro acesso:`, err);
  }

  return {
    success: true,
    message: genericMessage,

  };
}

/**
 * Redefine a senha com o token seguro de redefinição
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
      await updatePasswordUsingToken(token, newPassword, 'password_reset');
      return { success: true, message: 'Senha redefinida com sucesso.' };
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

export async function adminToggleUserAccess(email: string, active: boolean, actorName: string) {
      if (!pool) throw new Error('MarthiDB indisponível.');
      const result = await pool.query('UPDATE users SET active = $1, session_version = session_version + 1 WHERE lower(email) = $2 RETURNING id', [active, email.trim().toLowerCase()]);
      if (!result.rowCount) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
      return { success: true, message: active ? 'Acesso ativado.' : 'Acesso bloqueado.' };
    }

export async function getUserSecurityStatus(email: string, phone?: string) {
      if (!pool) throw new Error('MarthiDB indisponível.');
      const result = await pool.query('SELECT password_hash, active FROM users WHERE lower(email) = $1', [email.trim().toLowerCase()]);
      const row = result.rows[0];
      return { configured: Boolean(row?.password_hash && !row.password_hash.includes('LOCKED_PENDING_ACTIVATION')),
        active: Boolean(row?.active), phoneVerified: phone ? await isPhoneVerified(phone) : false };
    }

export type UserIdentificationResult = {
  identified: boolean;
  hasPassword: boolean;
  needsFirstAccess: boolean;
  name?: string;
  storeName?: string;
  role?: string;
  email: string;
  message?: string;
};

export async function identifyUserAccess(email: string): Promise<UserIdentificationResult> {
  const normEmail = email.trim().toLowerCase();

  // 2. Query PostgreSQL users and stores
  if (pool) {
    try {
      const userRes = await pool.query(
        `SELECT u.id, u.email, u.name, u.global_role, u.password_hash, u.active, u.client_account_id,
                s.id as store_id, s.trade_name as store_name
         FROM users u
         LEFT JOIN user_stores us ON us.user_id = u.id AND us.is_default = true
         LEFT JOIN stores s ON (s.id = us.store_id OR s.client_account_id = u.client_account_id)
         WHERE lower(u.email) = $1
         LIMIT 1`,
        [normEmail],
      );

      if (userRes.rows.length > 0) {
        const row = userRes.rows[0];
        const hasPwd = Boolean(
          row.password_hash &&
          row.password_hash !== 'LOCKED_PENDING_ACTIVATION' &&
          row.password_hash.length >= 4,
        );

        return {
          identified: true,
          hasPassword: hasPwd,
          needsFirstAccess: !hasPwd,
          name: row.name,
          storeName: row.store_name || 'Minha Loja',
          role: row.global_role,
          email: normEmail,
        };
      }

      // Check employees
      const empRes = await pool.query(
        `SELECT e.id, e.email, e.name, e.role, s.trade_name as store_name
         FROM employees e
         LEFT JOIN stores s ON s.id = e.store_id
         WHERE lower(e.email) = $1 OR lower(e.user_email) = $1
         LIMIT 1`,
        [normEmail],
      );

      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        return {
          identified: true,
          hasPassword: true,
          needsFirstAccess: false,
          name: emp.name,
          storeName: emp.store_name || 'Minha Loja',
          role: emp.role,
          email: normEmail,
        };
      }

      // Check client_accounts or partner_signups
      const clientRes = await pool.query(
        `SELECT c.id, c.email, c.contact_name, c.trade_name, ps.status as partner_status
         FROM client_accounts c
         LEFT JOIN partner_signups ps ON ps.id = c.id OR lower(ps.email) = lower(c.email)
         WHERE lower(c.email) = $1
         LIMIT 1`,
        [normEmail],
      );

      if (clientRes.rows.length > 0) {
        const cli = clientRes.rows[0];
        return {
          identified: true,
          hasPassword: false,
          needsFirstAccess: true,
          name: cli.contact_name || cli.trade_name,
          storeName: cli.trade_name,
          email: normEmail,
          message: 'Cadastro localizado! Defina sua senha inicial para acessar.',
        };
      }

      const psRes = await pool.query(
        `SELECT id, email, contact_name, trade_name, status
         FROM partner_signups
         WHERE lower(email) = $1
         LIMIT 1`,
        [normEmail],
      );

      if (psRes.rows.length > 0) {
        const ps = psRes.rows[0];
        return {
          identified: true,
          hasPassword: false,
          needsFirstAccess: true,
          name: ps.contact_name || ps.trade_name,
          storeName: ps.trade_name,
          email: normEmail,
          message: 'Cadastro localizado! Ative seu acesso para definir a senha inicial.',
        };
      }
    } catch (err) {
      throw err;
    }
  }

  return {
    identified: false,
    hasPassword: false,
    needsFirstAccess: true,
    email: normEmail,
  };
}


async function updatePasswordUsingToken(token: string, password: string, type: 'activation' | 'password_reset') {
    const strength = validatePasswordStrength(password);
    if (!strength.valid) throw Object.assign(new Error(strength.reason), { status: 400 });
    if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Token inválido.'), { status: 400 });
    if (!pool) throw new Error('MarthiDB indisponível.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const consumed = await client.query(`UPDATE auth_tokens SET used_at = now()
        WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING email`, [createHash('sha256').update(token).digest('hex'), type]);
      if (!consumed.rows[0]) throw Object.assign(new Error('Token inválido, expirado ou já usado.'), { status: 400 });
      const salt = randomBytes(16).toString('hex');
      const updated = await client.query('UPDATE users SET password_hash = $1, active = true, session_version = session_version + 1, updated_at = now() WHERE lower(email) = $2 RETURNING id',
        [salt + ':' + hashPassword(password, salt), consumed.rows[0].email]);
      if (!updated.rowCount) throw Object.assign(new Error('Conta não cadastrada.'), { status: 400 });
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
