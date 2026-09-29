import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';

export type TokenType = 'activation' | 'password_reset';

export type SecureTokenRecord = {
  id: string;
  tokenHash: string;
  type: TokenType;
  email: string;
  clientId?: string;
  name?: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
};

// In-memory token store as reliable backup & rapid access
const memoryTokens = new Map<string, SecureTokenRecord>();

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Cria um token criptograficamente seguro e armazena apenas seu hash SHA-256.
 * Retorna o token em texto puro apenas UMA VEZ para envio seguro no link do e-mail.
 */
export async function createSecureToken(params: {
  type: TokenType;
  email: string;
  clientId?: string;
  name?: string;
  ttlHours?: number;
}): Promise<{ rawToken: string; record: SecureTokenRecord }> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttl = params.ttlHours ?? (params.type === 'activation' ? 48 : 2);
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000).toISOString();
  const createdAt = new Date().toISOString();
  const id = `tok-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;

  const record: SecureTokenRecord = {
    id,
    tokenHash,
    type: params.type,
    email: params.email.trim().toLowerCase(),
    clientId: params.clientId,
    name: params.name?.trim(),
    expiresAt,
    usedAt: null,
    createdAt,
  };

  memoryTokens.set(tokenHash, record);

  // Invalidate any previous unused tokens of the same type for this email
  for (const [hash, existing] of memoryTokens.entries()) {
    if (
      hash !== tokenHash &&
      existing.email.toLowerCase() === record.email &&
      existing.type === record.type &&
      !existing.usedAt
    ) {
      existing.usedAt = new Date().toISOString();
    }
  }

  // Persist in DB if pool is available
  if (pool) {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_tokens (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          email TEXT NOT NULL,
          client_id TEXT,
          name TEXT,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      );
      // Invalidate old
      await pool.query(
        `UPDATE auth_tokens SET used_at = now() WHERE lower(email) = lower($1) AND type = $2 AND used_at IS NULL`,
        [record.email, record.type]
      );
      // Insert new
      await pool.query(
        `INSERT INTO auth_tokens (id, token_hash, type, email, client_id, name, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, tokenHash, record.type, record.email, record.clientId || null, record.name || null, expiresAt, createdAt]
      );
    } catch (err) {
      console.warn('[tokenService] DB token persistence error, using memory store:', err);
    }
  }

  return { rawToken, record };
}

/**
 * Valida o token sem consumi-lo (para checar se a tela pode abrir com segurança).
 */
export async function inspectToken(rawToken: string, expectedType?: TokenType): Promise<{
  valid: boolean;
  reason?: 'invalid' | 'expired' | 'already_used' | 'type_mismatch';
  record?: SecureTokenRecord;
}> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
    return { valid: false, reason: 'invalid' };
  }

  const tokenHash = hashToken(rawToken);
  let record = memoryTokens.get(tokenHash);

  if (!record && pool) {
    try {
      const res = await pool.query(
        `SELECT id, token_hash as "tokenHash", type, email, client_id as "clientId", name, expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt"
         FROM auth_tokens WHERE token_hash = $1`,
        [tokenHash]
      );
      if (res.rows.length > 0) {
        record = res.rows[0];
        if (record) memoryTokens.set(tokenHash, record);
      }
    } catch {
      // fallback
    }
  }

  if (!record) {
    return { valid: false, reason: 'invalid' };
  }

  if (expectedType && record.type !== expectedType) {
    return { valid: false, reason: 'type_mismatch', record };
  }

  if (record.usedAt) {
    return { valid: false, reason: 'already_used', record };
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: 'expired', record };
  }

  return { valid: true, record };
}

/**
 * Consome o token garantindo uso único (idempotência & segurança contra replay).
 */
export async function consumeSecureToken(rawToken: string, expectedType: TokenType): Promise<{
  success: boolean;
  reason?: string;
  record?: SecureTokenRecord;
}> {
  const inspection = await inspectToken(rawToken, expectedType);
  if (!inspection.valid || !inspection.record) {
    const errorMessages: Record<string, string> = {
      invalid: 'Token de verificação inválido ou inexistente.',
      expired: 'Este link expirou por motivos de segurança. Solicite um novo link.',
      already_used: 'Este link já foi utilizado anteriormente. Se necessário, solicite um novo.',
      type_mismatch: 'Tipo de token incompatível com esta operação.',
    };
    return {
      success: false,
      reason: errorMessages[inspection.reason || 'invalid'] || 'Token inválido.',
    };
  }

  const now = new Date().toISOString();
  inspection.record.usedAt = now;
  memoryTokens.set(inspection.record.tokenHash, inspection.record);

  if (pool) {
    try {
      await pool.query(`UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1`, [inspection.record.tokenHash]);
    } catch (err) {
      console.warn('[tokenService] DB token consumption update error:', err);
    }
  }

  return { success: true, record: inspection.record };
}
