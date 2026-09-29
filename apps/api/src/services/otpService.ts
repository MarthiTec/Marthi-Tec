import { randomInt } from 'node:crypto';
import { normalizeBrazilPhone, sendEvolutionText } from './evolutionWhatsApp.js';

export type OtpRecord = {
  phone: string;
  code: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  verified: boolean;
  verifiedAt?: string;
  createdAt: number;
  lastSentAt: number;
  sendCount: number;
};

// Store OTPs in-memory (and can be backed by DB)
const otpStore = new Map<string, OtpRecord>();
const verifiedPhones = new Set<string>();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_RESENDS_PER_WINDOW = 4;
const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Gera e envia um código OTP de 6 dígitos para o celular via WhatsApp (Evolution) ou fallback.
 */
export async function sendPhoneOtp(
  phone: string,
  customerName?: string
): Promise<{ success: boolean; message: string; channel: 'whatsapp' | 'simulation' }> {
  const digits = cleanPhone(phone);
  if (digits.length < 10 || digits.length > 13) {
    throw new Error('Número de telefone inválido para envio do código de verificação.');
  }

  const now = Date.now();
  let existing = otpStore.get(digits);

  // Rate limiting check
  if (existing) {
    if (now - existing.createdAt < RESEND_WINDOW_MS) {
      if (existing.sendCount >= MAX_RESENDS_PER_WINDOW) {
        throw new Error('Limite de tentativas de envio de código atingido para este número. Tente novamente mais tarde.');
      }
      if (now - existing.lastSentAt < 30 * 1000) {
        throw new Error('Aguarde 30 segundos antes de solicitar um novo código.');
      }
    } else {
      // Reset window
      existing = undefined;
    }
  }

  // Generate 6-digit code (e.g. 100000 - 999999)
  const code = String(randomInt(100000, 999999));
  const record: OtpRecord = {
    phone: digits,
    code,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    expiresAt: now + OTP_TTL_MS,
    verified: false,
    createdAt: existing ? existing.createdAt : now,
    lastSentAt: now,
    sendCount: (existing ? existing.sendCount : 0) + 1,
  };

  otpStore.set(digits, record);

  const formattedName = customerName ? customerName.trim() : 'cliente Marthi';
  const textMessage = [
    `🔐 *Código de Segurança Marthi Tecnologia*`,
    ``,
    `Olá, ${formattedName}!`,
    `Seu código de confirmação para ativação da sua conta é:`,
    ``,
    `*${code}*`,
    ``,
    `Ele é válido por 10 minutos. Nunca compartilhe este código com terceiros.`,
  ].join('\n');

  let channel: 'whatsapp' | 'simulation' = 'simulation';

  try {
    const res = await sendEvolutionText(digits, textMessage);
    if (res.ok) {
      channel = 'whatsapp';
      console.log(`[otpService] OTP WhatsApp enviado com sucesso para ${digits}`);
    } else {
      console.warn(`[otpService] Evolution WhatsApp falhou (${res.status}), código gerado em sandbox: ${code}`);
    }
  } catch (err) {
    console.info(`[otpService] Evolution não configurado ou indisponível (${(err as Error).message}). Código de sandbox para testes: ${code}`);
  }

  return {
    success: true,
    message: channel === 'whatsapp' 
      ? 'Código de confirmação enviado para seu WhatsApp!' 
      : 'Código de verificação gerado com sucesso.',
    channel,
  };
}

/**
 * Valida o código OTP informado pelo usuário.
 */
export function verifyPhoneOtp(
  phone: string,
  code: string
): { success: boolean; message: string; verifiedAt?: string } {
  const digits = cleanPhone(phone);
  const record = otpStore.get(digits);

  if (!record) {
    return {
      success: false,
      message: 'Nenhum código foi solicitado para este número ou ele já expirou.',
    };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(digits);
    return {
      success: false,
      message: 'O código informado expirou (validade de 10 minutos). Solicite um novo código.',
    };
  }

  if (record.attempts >= record.maxAttempts) {
    otpStore.delete(digits);
    return {
      success: false,
      message: 'Limite de tentativas incorretas excedido. Solicite um novo código por segurança.',
    };
  }

  record.attempts += 1;

  if (record.code.trim() !== code.trim()) {
    const remaining = record.maxAttempts - record.attempts;
    return {
      success: false,
      message: `Código incorreto. Você tem mais ${remaining} tentativa(s).`,
    };
  }

  // Success
  const verifiedAt = new Date().toISOString();
  record.verified = true;
  record.verifiedAt = verifiedAt;
  verifiedPhones.add(digits);
  // Remove consumed OTP to prevent replay
  otpStore.delete(digits);

  console.log(`[otpService] Celular ${digits} verificado com sucesso em ${verifiedAt}`);
  return {
    success: true,
    message: 'Número de celular confirmado com sucesso!',
    verifiedAt,
  };
}

export function isPhoneVerified(phone: string): boolean {
  return verifiedPhones.has(cleanPhone(phone));
}

export function markPhoneVerified(phone: string): void {
  verifiedPhones.add(cleanPhone(phone));
}
