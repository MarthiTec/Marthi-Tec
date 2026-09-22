import { env } from '../config/env.js';

export type TotemLeadPayload = {
  customerName: string;
  customerPhone: string;
  productName: string;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
  /** Número da loja (painel). Tem prioridade sobre EVOLUTION_STORE_NUMBER. */
  storeWhatsApp?: string;
  notifyCustomer?: boolean;
  locationLabel?: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Normaliza para E.164 BR sem +: 5511999999999 */
export function normalizeBrazilPhone(phone: string): string {
  let digits = onlyDigits(phone);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildTotemLeadMessage(
  lead: TotemLeadPayload,
  locationLabel?: string,
): string {
  const location = (locationLabel ?? env.TOTEM_LOCATION_LABEL)?.trim() || '';
  const paymentLine =
    lead.payment === 'Parcelado' && lead.installment
      ? `${lead.payment} (${lead.installment})`
      : lead.payment;

  return [
    'Olá! Tudo bem? 😊',
    '',
    `Meu nome é *${lead.customerName}*.`,
    `Acabei de escolher um produto no Totem${location ? ` (${location})` : ''} e gostaria de confirmar o pedido.`,
    '',
    'Aqui estão os detalhes:',
    '',
    `📱 *Modelo*: ${lead.productName}`,
    `🎨 *Cor*: ${lead.color}`,
    `💾 *Capacidade*: ${lead.storage}`,
    `📦 *Retirada*: ${lead.fulfillment}`,
    `💰 *Forma de pagamento*: ${paymentLine}`,
    `💵 *Preço*: ${lead.priceLabel}`,
    `📞 *Telefone do cliente*: ${lead.customerPhone}`,
    '',
    'Poderíamos formalizar o pedido?',
  ].join('\n');
}

export async function sendEvolutionText(number: string, text: string): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const baseUrl = env.EVOLUTION_BASE_URL?.replace(/\/$/, '');
  const instance = env.EVOLUTION_INSTANCE;
  const apiKey = env.EVOLUTION_API_KEY;

  if (!baseUrl || !instance || !apiKey) {
    const error = new Error(
      'Evolution não configurado. Defina EVOLUTION_BASE_URL, EVOLUTION_INSTANCE e EVOLUTION_API_KEY.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: normalizeBrazilPhone(number),
      text,
      delay: 1200,
      linkPreview: false,
    }),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function submitTotemLead(lead: TotemLeadPayload): Promise<{
  storeMessageId: unknown;
  customerNotified: boolean;
}> {
  const storeNumber = lead.storeWhatsApp?.trim() || env.EVOLUTION_STORE_NUMBER;
  if (!storeNumber) {
    const error = new Error(
      'Número da loja não configurado. Informe o WhatsApp em Painel → Totem → WhatsApp, ou EVOLUTION_STORE_NUMBER.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const message = buildTotemLeadMessage(lead, lead.locationLabel);
  const storeResult = await sendEvolutionText(storeNumber, message);

  if (!storeResult.ok) {
    const error = new Error('Falha ao enviar WhatsApp via Evolution para a loja.');
    (error as Error & { status: number; details: unknown }).status = 502;
    (error as Error & { details: unknown }).details = storeResult.body;
    throw error;
  }

  const shouldNotify =
    typeof lead.notifyCustomer === 'boolean'
      ? lead.notifyCustomer
      : Boolean(env.EVOLUTION_NOTIFY_CUSTOMER);

  let customerNotified = false;
  if (shouldNotify) {
    const customerMsg = [
      `Olá, ${lead.customerName}! 👋`,
      '',
      'Recebemos sua escolha no Totem Marthi.',
      `Produto: *${lead.productName}* (${lead.color} · ${lead.storage}).`,
      '',
      'Em breve a loja entrará em contato para confirmar o pedido.',
    ].join('\n');

    const customerResult = await sendEvolutionText(lead.customerPhone, customerMsg);
    customerNotified = customerResult.ok;
  }

  return {
    storeMessageId: storeResult.body,
    customerNotified,
  };
}
