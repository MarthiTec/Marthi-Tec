import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { getStoreWhatsAppConfig } from './storeCommunication.js';
import { resolveStoreEvolutionCreds, sendEvolutionText } from './evolutionWhatsApp.js';

/**
 * Lembrete de chegada da encomenda. No dia previsto, a partir da hora configurada da loja, o cliente
 * recebe no WhatsApp que o produto está a caminho e a loja recebe o lembrete para chamar o cliente.
 * Os textos ficam na loja (Comunicação) — os padrões abaixo valem só até a loja salvar os seus.
 */
export const reminderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  hour: z.coerce.number().int().min(6).max(20).default(10),
  customerTemplate: z.string().trim().min(1).max(1000).default(
    'Olá, {cliente}! Aqui é da {loja}. Seu pedido ({produto}) já está a caminho e chega hoje. Em breve entraremos em contato para você vir buscar. 😊',
  ),
  storeTemplate: z.string().trim().min(1).max(1000).default(
    'Lembrete: hoje chega a encomenda de {cliente} ({telefone}) — {produto}. Avise o cliente assim que o produto chegar.',
  ),
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export async function readReminderSettings(storeId: string): Promise<ReminderSettings> {
  const row = (await pool.query('SELECT order_reminder_settings AS s FROM stores WHERE id = $1', [storeId])).rows[0];
  const raw = typeof row?.s === 'string' ? JSON.parse(row.s) : row?.s ?? {};
  return reminderSettingsSchema.parse(raw);
}

export async function saveReminderSettings(storeId: string, input: unknown) {
  const settings = reminderSettingsSchema.parse(input);
  await pool.query('UPDATE stores SET order_reminder_settings = $2::jsonb, updated_at = now() WHERE id = $1', [storeId, JSON.stringify(settings)]);
  return settings;
}

/** Data (AAAA-MM-DD) e hora no fuso de São Paulo. */
export function saoPauloNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function renderReminder(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

type DueItem = { source: 'pickup' | 'commercial'; refId: string; customerName: string; customerPhone: string; productName: string };

/** Encomendas com chegada prevista na data: venda com retirada por encomenda e Encomendas & Ofertas. */
export async function dueArrivals(storeId: string, date: string): Promise<DueItem[]> {
  const pickups = (
    await pool.query(
      `SELECT p.id, p.reference_id, p.customer_name, p.customer_phone, COALESCE(s.name, '') AS product_name
         FROM pickup_requests p LEFT JOIN stock_items s ON s.id = p.stock_id
        WHERE p.store_id = $1 AND p.kind = 'order' AND p.status = 'waiting' AND p.estimated_date = $2::date`,
      [storeId, date],
    )
  ).rows;
  const orders = (
    await pool.query(
      `SELECT o.id, c.name AS customer_name, COALESCE(c.phone, '') AS customer_phone, COALESCE(o.details->'offer'->>'model', '') AS product_name, o.details->>'expectedAt' AS expected_at
         FROM commercial_orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.store_id = $1 AND o.status IN ('purchased', 'in_transit') AND o.details->>'expectedAt' IS NOT NULL`,
      [storeId],
    )
  ).rows.filter((row) => row.expected_at && saoPauloNow(new Date(row.expected_at)).date === date);
  return [
    ...pickups.map((row) => ({ source: 'pickup' as const, refId: row.id, customerName: row.customer_name ?? '', customerPhone: row.customer_phone ?? '', productName: row.product_name })),
    ...orders.map((row) => ({ source: 'commercial' as const, refId: row.id, customerName: row.customer_name ?? '', customerPhone: row.customer_phone ?? '', productName: row.product_name })),
  ];
}

type Sender = (storeId: string, phone: string, text: string) => Promise<void>;

/** Envio pelo WhatsApp conectado da loja (Evolution). */
const whatsappSender: Sender = async (storeId, phone, text) => {
  const cfg = await getStoreWhatsAppConfig(storeId);
  if (!cfg.enabled) throw new Error('WhatsApp desativado nesta loja.');
  const { baseUrl, instance, apiKey } = resolveStoreEvolutionCreds(cfg);
  if (!baseUrl || !instance || !apiKey) throw new Error('WhatsApp da loja não configurado.');
  const result = await sendEvolutionText(phone, text, { baseUrl, instance, apiKey, storeId });
  if (!result.ok) throw new Error(`WhatsApp recusou o envio (${result.status}).`);
};

/**
 * Roda os lembretes do dia: cada encomenda recebe um registro único (loja + origem + encomenda + data),
 * então o mesmo lembrete nunca é enviado duas vezes, mesmo com o servidor reiniciando.
 */
export async function runOrderReminders(options: { now?: Date; sender?: Sender; storeNumber?: (storeId: string) => Promise<string> } = {}) {
  const { date, hour } = saoPauloNow(options.now);
  const sender = options.sender ?? whatsappSender;
  const storeNumberOf = options.storeNumber ?? (async (storeId: string) => String((await getStoreWhatsAppConfig(storeId)).storeNumber ?? ''));
  const stores = (
    await pool.query(`SELECT s.id, COALESCE(NULLIF(to_jsonb(s)->>'trade_name', ''), to_jsonb(s)->>'name', '') AS name FROM stores s WHERE s.active = true`)
  ).rows;
  let sent = 0;
  for (const store of stores) {
    const settings = await readReminderSettings(store.id);
    if (!settings.enabled || hour < settings.hour) continue;
    const due = await dueArrivals(store.id, date);
    if (!due.length) continue;
    const storeNumber = await storeNumberOf(store.id).catch(() => '');
    for (const item of due) {
      const values = { cliente: item.customerName || 'cliente', produto: item.productName || 'seu produto', loja: store.name, telefone: item.customerPhone || 'sem telefone', data: date.split('-').reverse().join('/'), pedido: item.refId };
      const customerMessage = renderReminder(settings.customerTemplate, values);
      const storeMessage = renderReminder(settings.storeTemplate, values);
      const claimed = (
        await pool.query(
          `INSERT INTO order_reminders (id, store_id, source, ref_id, reminder_date, customer_name, customer_phone, product_name, customer_message, store_message)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)
           ON CONFLICT (store_id, source, ref_id, reminder_date) DO NOTHING RETURNING id`,
          [`REM-${randomUUID()}`, store.id, item.source, item.refId, date, item.customerName, item.customerPhone, item.productName, customerMessage, storeMessage],
        )
      ).rows[0];
      if (!claimed) continue;
      const errors: string[] = [];
      let customerStatus = 'skipped';
      let storeStatus = 'skipped';
      if (item.customerPhone) {
        try {
          await sender(store.id, item.customerPhone, customerMessage);
          customerStatus = 'sent';
          sent += 1;
        } catch (error) {
          customerStatus = 'failed';
          errors.push(`Cliente: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (storeNumber) {
        try {
          await sender(store.id, storeNumber, storeMessage);
          storeStatus = 'sent';
        } catch (error) {
          storeStatus = 'failed';
          errors.push(`Loja: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await pool.query('UPDATE order_reminders SET customer_status = $2, store_status = $3, error = $4, sent_at = now() WHERE id = $1', [claimed.id, customerStatus, storeStatus, errors.join(' · ')]);
    }
  }
  return { date, sent };
}

let timer: NodeJS.Timeout | null = null;
/** Verifica os lembretes a cada 5 minutos (o horário de cada loja decide quando envia). */
export function startOrderReminderWorker() {
  if (timer) return;
  const tick = () => void runOrderReminders().catch((error) => console.error('[lembretes] Falha ao enviar lembretes de encomenda:', error));
  timer = setInterval(tick, 5 * 60 * 1000);
  setTimeout(tick, 30 * 1000);
}
