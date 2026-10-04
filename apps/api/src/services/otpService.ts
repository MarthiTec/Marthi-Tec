import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { sendEvolutionText } from './evolutionWhatsApp.js';

function phoneDigits(phone: string) { return phone.replace(/\D/g, ''); }
function codeHash(phone: string, code: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');
}
function database() {
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  return pool;
}

export async function sendPhoneOtp(phone: string, customerName?: string): Promise<{ success: boolean; message: string; channel: 'whatsapp' }> {
  const digits = phoneDigits(phone);
  if (digits.length < 10 || digits.length > 13) throw Object.assign(new Error('Telefone inválido.'), { status: 400 });
  const client = await database().connect();
  const code = String(randomInt(100000, 1000000));
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${digits}`]);
    const previous = await client.query('SELECT * FROM phone_otps WHERE phone = $1 FOR UPDATE', [digits]);
    const row = previous.rows[0];
    const now = Date.now();
    const sameWindow = row && now - new Date(row.window_started_at).getTime() < 3600000;
    if (sameWindow && (row.send_count >= 4 || now - new Date(row.last_sent_at).getTime() < 30000)) {
      throw Object.assign(new Error('Aguarde antes de solicitar outro código.'), { status: 429 });
    }
    await client.query(`INSERT INTO phone_otps (phone, code_hash, attempts, expires_at, send_count, window_started_at, last_sent_at, verified_at)
      VALUES ($1,$2,0,now() + interval '10 minutes',$3,$4,now(),NULL)
      ON CONFLICT (phone) DO UPDATE SET code_hash = $2, attempts = 0, expires_at = now() + interval '10 minutes',
      send_count = $3, window_started_at = $4, last_sent_at = now(), verified_at = NULL`,
      [digits, codeHash(digits, code), sameWindow ? row.send_count + 1 : 1, sameWindow ? row.window_started_at : new Date()]);
    const sent = await sendEvolutionText(digits, `Olá, ${customerName?.trim() || 'cliente Marthi'}. Seu código de confirmação é ${code}. Válido por 10 minutos.`);
    if (!sent.ok) throw Object.assign(new Error('Não foi possível enviar o código pelo WhatsApp.'), { status: 503 });
    await client.query('COMMIT');
    return { success: true, message: 'Código enviado pelo WhatsApp.', channel: 'whatsapp' };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<{ success: boolean; message: string; verifiedAt?: string }> {
  const digits = phoneDigits(phone);
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM phone_otps WHERE phone = $1 FOR UPDATE', [digits]);
    const row = result.rows[0];
    if (!row || row.verified_at || row.attempts >= 5 || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('COMMIT');
      return { success: false, message: 'Código inválido ou expirado.' };
    }
    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = Buffer.from(codeHash(digits, code.trim()), 'hex');
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    const verifiedAt = valid ? new Date().toISOString() : undefined;
    await client.query('UPDATE phone_otps SET attempts = attempts + 1, verified_at = $2 WHERE phone = $1', [digits, verifiedAt || null]);
    await client.query('COMMIT');
    return { success: valid, message: valid ? 'Celular confirmado.' : 'Código incorreto.', verifiedAt };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function isPhoneVerified(phone: string): Promise<boolean> {
  const result = await database().query('SELECT verified_at FROM phone_otps WHERE phone = $1', [phoneDigits(phone)]);
  return Boolean(result.rows[0]?.verified_at);
}
