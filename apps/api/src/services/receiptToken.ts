import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Assinatura do comprovante de venda: o QR Code impresso leva o número da venda e esta
 * assinatura. Só quem tem o comprovante consegue abrir a versão pública (não dá para adivinhar).
 */
export function receiptToken(saleId: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`sale-receipt:${saleId}`).digest('base64url').slice(0, 22);
}

export function validReceiptToken(saleId: string, token: string) {
  const expected = Buffer.from(receiptToken(saleId));
  const given = Buffer.from(String(token || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** CPF/CNPJ do cliente na versão pública: só os 3 últimos dígitos. */
export function maskDocument(document: string) {
  const digits = String(document || '').replace(/\D/g, '');
  if (!digits) return '';
  return `${'•'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}
