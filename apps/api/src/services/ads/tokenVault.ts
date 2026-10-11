import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Cofre dos tokens dos provedores de anúncio (AES-256-GCM). A chave vem de META_TOKEN_KEY (32 bytes em
 * base64) e é exclusiva para isso — sem ela, nenhuma conexão é aceita. O texto guardado tem a versão
 * da chave para permitir rotação futura.
 */
function key(): Buffer {
  const raw = env.META_TOKEN_KEY ? Buffer.from(env.META_TOKEN_KEY, 'base64') : Buffer.alloc(0);
  if (raw.length !== 32) throw Object.assign(new Error('Chave de criptografia dos tokens (META_TOKEN_KEY) ausente ou inválida.'), { status: 503 });
  return raw;
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
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function openToken(sealed: string | null | undefined) {
  if (!sealed) throw Object.assign(new Error('Conta não conectada.'), { status: 409 });
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw Object.assign(new Error('Token guardado em formato desconhecido. Conecte de novo.'), { status: 409 });
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
