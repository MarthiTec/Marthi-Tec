import { env } from '../config/env.js';
import { getStoreWhatsAppConfig } from './storeCommunication.js';
import { beginDelivery, finishDelivery } from './communicationAudit.js';

export type TotemLeadPayload = {
  storeId?: string;
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

/**
 * Resolve as credenciais efetivas da Evolution para uma loja: usa o que foi salvo no banco
 * para esta loja e, quando algum campo não foi definido, cai para os defaults da plataforma
 * (variáveis de ambiente do servidor — nunca hardcoded no front).
 */
export function resolveStoreEvolutionCreds(cfg: { baseUrl: string; instance: string; apiKey: string }): {
  baseUrl: string;
  instance: string;
  apiKey: string;
} {
  return {
    baseUrl: (cfg.baseUrl || env.EVOLUTION_BASE_URL || '').replace(/\/$/, ''),
    instance: cfg.instance,
    apiKey: cfg.apiKey || env.EVOLUTION_MASTER_API_KEY || env.EVOLUTION_API_KEY || '',
  };
}

/**
 * Garante que a loja tenha sua própria instância na Evolution API, criando-a quando ainda
 * não existir. Usa exclusivamente a chave mestra do servidor (nunca a chave da loja), então
 * cada empresa consegue se conectar sem jamais ver ou precisar informar essa chave.
 */
/**
 * Apaga e recria a instância do zero. Depois que o WhatsApp desconecta o aparelho (erro 401),
 * a sessão antiga fica gravada na Evolution e o celular trava em "Conectando…" ao ler o QR;
 * só uma instância limpa volta a parear. O token salvo pela loja é mantido na recriação, para
 * que a chave cadastrada no painel continue válida.
 */
export async function resetEvolutionInstance(
  baseUrl: string,
  instanceName: string,
  instanceToken?: string,
): Promise<void> {
  const masterKey = env.EVOLUTION_MASTER_API_KEY;
  if (!masterKey) {
    const error = new Error('Reconexão limpa indisponível: configure EVOLUTION_MASTER_API_KEY no servidor.');
    (error as Error & { status: number }).status = 501;
    throw error;
  }
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const name = encodeURIComponent(instanceName);
  for (const path of [`/instance/logout/${name}`, `/instance/delete/${name}`]) {
    try {
      await fetch(`${cleanBaseUrl}${path}`, {
        method: 'DELETE',
        headers: { apikey: masterKey },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      /* instância já desconectada ou inexistente: segue para recriar */
    }
  }
  await ensureEvolutionInstance(cleanBaseUrl, instanceName, instanceToken);
}

export async function ensureEvolutionInstance(
  baseUrl: string,
  instanceName: string,
  instanceToken?: string,
): Promise<{ created: boolean }> {
  const masterKey = env.EVOLUTION_MASTER_API_KEY;
  if (!masterKey) {
    const error = new Error(
      'Provisionamento automático indisponível: configure EVOLUTION_MASTER_API_KEY no servidor.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${cleanBaseUrl}/instance/create`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', apikey: masterKey },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        ...(instanceToken ? { token: instanceToken } : {}),
      }),
    });
  } catch {
    const error = new Error('Não foi possível conectar ao servidor Evolution para criar a instância.');
    (error as Error & { status: number }).status = 502;
    throw error;
  }

  const raw = await response.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = null; }

  if (response.ok) return { created: true };

  const messages = Array.isArray(body?.response?.message)
    ? body.response.message.join(' ')
    : String(body?.response?.message || body?.message || '');
  if (response.status === 403 && /already in use/i.test(messages)) {
    return { created: false };
  }

  const error = new Error(messages || 'Falha ao criar instância na Evolution API.');
  (error as Error & { status: number }).status = 502;
  throw error;
}

export async function sendEvolutionText(
  number: string,
  text: string,
  customConfig?: { baseUrl?: string; instance?: string; apiKey?: string; storeId?: string },
): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const baseUrl = (customConfig ? customConfig.baseUrl : env.EVOLUTION_BASE_URL)?.replace(/\/$/, '');
  const instance = customConfig ? customConfig.instance : env.EVOLUTION_INSTANCE;
  const apiKey = customConfig ? customConfig.apiKey : env.EVOLUTION_API_KEY;

  if (!baseUrl || !instance || !apiKey) {
    const error = new Error(
      'Evolution não configurado. Defina a URL base, instância e API Key da Evolution API nas Operações.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const recipient = normalizeBrazilPhone(number);
  if (!/^55\d{10,11}$/.test(recipient)) throw Object.assign(new Error('Telefone brasileiro inválido. Informe DDD e número.'), {status:400});
  const deliveryId = await beginDelivery(customConfig?.storeId, 'whatsapp', recipient);
  let response: Response;
  try {
  response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST', signal: AbortSignal.timeout(15000), redirect: 'error',
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

  } catch (error) {
    await finishDelivery(deliveryId, 'unknown');
    throw Object.assign(new Error('Sem confirmação do Evolution. Verifique o histórico antes de repetir para evitar duplicidade.'), {status:502});
  }
  const raw = await response.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = null; }
  const accepted = response.ok && !!body?.key?.id;
  await finishDelivery(deliveryId, accepted ? 'accepted' : response.ok ? 'unknown' : 'failed', response.status, accepted ? String(body.key.id) : undefined);

  return {
    ok: accepted,
    status: response.status,
    body,
  };
}

export async function submitTotemLead(lead: TotemLeadPayload): Promise<{
  storeMessageId: unknown;
  customerNotified: boolean;
}> {
  const config = lead.storeId ? await getStoreWhatsAppConfig(lead.storeId) : undefined;
  if (config && !config.enabled) throw Object.assign(new Error('WhatsApp desativado nesta loja.'), {status:400});
  const storeNumber = lead.storeWhatsApp?.trim() || (config ? config.storeNumber : env.EVOLUTION_STORE_NUMBER);
  if (!storeNumber) {
    const error = new Error(
      'Número da loja não configurado. Informe o WhatsApp em Painel → Totem → WhatsApp, ou EVOLUTION_STORE_NUMBER.',
    );
    (error as Error & { status: number }).status = 501;
    throw error;
  }

  const message = buildTotemLeadMessage(lead, lead.locationLabel);
  const storeResult = await sendEvolutionText(storeNumber, message, config ? {...config, storeId:lead.storeId} : undefined);

  if (!storeResult.ok) {
    const error = new Error('Falha ao enviar WhatsApp via Evolution para a loja.');
    (error as Error & { status: number; details: unknown }).status = 502;
    (error as Error & { details: unknown }).details = storeResult.body;
    throw error;
  }

  const shouldNotify = config?.notifyCustomer ?? lead.notifyCustomer ?? Boolean(env.EVOLUTION_NOTIFY_CUSTOMER);

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

    try {
      const customerResult = await sendEvolutionText(lead.customerPhone, customerMsg, config ? {...config, storeId:lead.storeId} : undefined);
      customerNotified = customerResult.ok;
    } catch { /* Store delivery was accepted; do not repeat it because customer acknowledgement failed. */ }
  }

  return {
    storeMessageId: storeResult.body,
    customerNotified,
  };
}
