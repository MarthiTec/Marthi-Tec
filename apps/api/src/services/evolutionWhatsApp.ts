import { env } from '../config/env.js';
import { getStoreWhatsAppConfig } from './storeCommunication.js';
import { beginDelivery, finishDelivery } from './communicationAudit.js';

/** Pedido do totem que vira mensagem automática da loja para o cliente. */
export type TotemLeadPayload = {
  storeId?: string;
  customerName: string;
  customerPhone: string;
  /** Mensagem já montada a partir do modelo das Configurações do Totem. */
  customerMessage: string;
};

/** Modelo padrão da mensagem que a loja envia ao cliente depois do pedido no totem. */
export const DEFAULT_TOTEM_CUSTOMER_MESSAGE = [
  'Oi, {nome}! 🎉 Tudo bem?',
  '',
  'Aqui é *{vendedor}*, da *{loja}*! Acabei de receber o pedido que você fez no nosso Totem e já vim correndo falar com você 😄',
  '',
  'Que escolha incrível! Olha só o que você separou:',
  '',
  '📱 *{produto}*',
  '✨ {atributos}',
  '💳 Pagamento: *{pagamento}*',
  '💰 Valor: *{valor}*',
  '📦 Retirada: {retirada}',
  '',
  'Já estou cuidando de tudo por aqui. Posso confirmar o seu pedido? Qualquer dúvida é só me chamar, estou à disposição! 🙌',
].join('\n');

/**
 * Troca os marcadores do modelo pelos dados do pedido. Além dos marcadores fixos, cada atributo
 * do produto vira um marcador com o próprio nome, ex.: {Cor} e {Capacidade}. Marcador sem valor
 * some da mensagem em vez de aparecer cru para o cliente; uma linha cujos marcadores ficaram
 * todos vazios (ex.: "📦 Retirada: {retirada}" sem retirada) é removida inteira.
 */
export function renderTotemCustomerMessage(template: string, values: Record<string, string>): string {
  const lookup = new Map(
    Object.entries(values).map(([key, value]) => [key.trim().toLocaleLowerCase('pt-BR'), value.trim()]),
  );
  const placeholder = /\{([^{}]{1,60})\}/g;
  return template
    .split('\n')
    .flatMap((line) => {
      const keys = [...line.matchAll(placeholder)].map((match) => match[1].trim().toLocaleLowerCase('pt-BR'));
      if (keys.length && keys.every((key) => !lookup.get(key))) return [];
      const filled = line
        .replace(placeholder, (_, key: string) => lookup.get(key.trim().toLocaleLowerCase('pt-BR')) ?? '')
        .replace(/\*\s*\*/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +([,.!?])/g, '$1')
        .trimEnd();
      return [filled];
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

/** Envia um arquivo (ex.: comprovante em PDF) pelo WhatsApp da loja na Evolution. */
export async function sendEvolutionDocument(
  number: string,
  file: { base64: string; fileName: string; mimetype: string; caption?: string },
  customConfig: { baseUrl?: string; instance?: string; apiKey?: string; storeId?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const baseUrl = customConfig.baseUrl?.replace(/\/$/, '');
  const { instance, apiKey } = customConfig;
  if (!baseUrl || !instance || !apiKey) {
    throw Object.assign(new Error('Evolution não configurado. Conecte o WhatsApp da loja em Operações.'), { status: 501 });
  }
  const recipient = normalizeBrazilPhone(number);
  if (!/^55\d{10,11}$/.test(recipient)) throw Object.assign(new Error('Telefone brasileiro inválido. Informe DDD e número.'), { status: 400 });
  const deliveryId = await beginDelivery(customConfig.storeId, 'whatsapp', recipient);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST', signal: AbortSignal.timeout(30000), redirect: 'error',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        number: recipient,
        mediatype: 'document',
        mimetype: file.mimetype,
        media: file.base64,
        fileName: file.fileName,
        caption: file.caption ?? '',
        delay: 1200,
      }),
    });
  } catch {
    await finishDelivery(deliveryId, 'unknown');
    throw Object.assign(new Error('Sem confirmação do Evolution para o PDF. Verifique o histórico antes de repetir.'), { status: 502 });
  }
  const raw = await response.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = null; }
  const accepted = response.ok && !!body?.key?.id;
  await finishDelivery(deliveryId, accepted ? 'accepted' : response.ok ? 'unknown' : 'failed', response.status, accepted ? String(body.key.id) : undefined);
  return { ok: accepted, status: response.status, body };
}

/**
 * Pedido do totem com "Concluir pelo WhatsApp": a loja (o número conectado na Evolution) manda
 * a mensagem direto para o telefone que o cliente digitou. O cliente não precisa ler QR nem
 * abrir o WhatsApp; a conversa já começa no celular do vendedor.
 */
export async function submitTotemLead(lead: TotemLeadPayload): Promise<{
  messageId: unknown;
  customerNotified: boolean;
}> {
  const config = lead.storeId ? await getStoreWhatsAppConfig(lead.storeId) : undefined;
  if (config && !config.enabled) throw Object.assign(new Error('WhatsApp desativado nesta loja.'), {status:400});
  if (config && !config.instance) {
    throw Object.assign(new Error('Nenhum WhatsApp conectado a esta loja. Leia o QR Code em Configurações › Comunicação.'), {status:501});
  }
  const result = await sendEvolutionText(
    lead.customerPhone,
    lead.customerMessage,
    config ? { ...resolveStoreEvolutionCreds(config), storeId: lead.storeId } : undefined,
  );
  if (!result.ok) {
    const error = new Error('A Evolution não confirmou o envio da mensagem ao cliente.');
    (error as Error & { status: number; details: unknown }).status = 502;
    (error as Error & { details: unknown }).details = result.body;
    throw error;
  }
  return { messageId: result.body, customerNotified: true };
}
