import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Cofre dos tokens dos provedores de anúncio (AES-256-GCM). A chave vem de META_TOKEN_KEY (32 bytes em
 * base64) e é exclusiva para isso — sem ela, nenhuma conexão é aceita. O texto guardado tem a versão
 * da chave para permitir rotação futura.
 */
function platformKey(): Buffer | null {
  const raw = env.META_TOKEN_KEY ? Buffer.from(env.META_TOKEN_KEY, 'base64') : Buffer.alloc(0);
  return raw.length === 32 ? raw : null;
}

/** Sem META_TOKEN_KEY, a chave é derivada do segredo do servidor (HKDF) — conexões por loja funcionam assim. */
function derivedKey(): Buffer {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) throw Object.assign(new Error('Chave de proteção dos tokens indisponível no servidor.'), { status: 503 });
  return Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'marthi-meta-tokens', 'aes-256-gcm-v2', 32));
}

function key(): Buffer {
  return platformKey() ?? derivedKey();
}

export function vaultReady() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function sealToken(plain: string) {
  const iv = randomBytes(12);
  // v1 = chave do servidor (META_TOKEN_KEY); v2 = chave derivada do segredo do servidor.
  const version = platformKey() ? 'v1' : 'v2';
  const cipher = createCipheriv('aes-256-gcm', version === 'v1' ? platformKey()! : derivedKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [version, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function openToken(sealed: string | null | undefined) {
  if (!sealed) throw Object.assign(new Error('Conta não conectada.'), { status: 409 });
  const [version, iv, tag, data] = sealed.split('.');
  if ((version !== 'v1' && version !== 'v2') || !iv || !tag || !data) throw Object.assign(new Error('Token guardado em formato desconhecido. Conecte de novo.'), { status: 409 });
  const keyBytes = version === 'v1' ? platformKey() : derivedKey();
  if (!keyBytes) throw Object.assign(new Error('Chave de criptografia dos tokens (META_TOKEN_KEY) ausente. Conecte de novo.'), { status: 409 });
  const decipher = createDecipheriv('aes-256-gcm', keyBytes, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
