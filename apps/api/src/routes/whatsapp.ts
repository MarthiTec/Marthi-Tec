import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { requireOrDemoAuth } from '../middlewares/authMiddleware.js';
import { sendEvolutionText, normalizeBrazilPhone } from '../services/evolutionWhatsApp.js';

export const whatsappRouter = Router();

export type StoreWhatsAppConfig = {
  enabled: boolean;
  baseUrl: string;
  instance: string;
  apiKey: string;
  storeNumber: string;
  notifyCustomer: boolean;
  locationLabel: string;
};

const defaultWhatsAppConfig: StoreWhatsAppConfig = {
  enabled: true,
  baseUrl: env.EVOLUTION_BASE_URL?.replace(/\/$/, '') || 'https://marthi-tec.discloud.app',
  instance: env.EVOLUTION_INSTANCE || 'marthi',
  apiKey: env.EVOLUTION_API_KEY || '5E280C9D-239A-4D8B-A765-63D00C291331',
  storeNumber: env.EVOLUTION_STORE_NUMBER || '5524981244253',
  notifyCustomer: Boolean(env.EVOLUTION_NOTIFY_CUSTOMER ?? true),
  locationLabel: env.TOTEM_LOCATION_LABEL || 'Cell Ponto Três Rios',
};

const memoryWhatsAppConfigs = new Map<string, StoreWhatsAppConfig>([
  ['STR-DEMO-01', { ...defaultWhatsAppConfig }],
]);

const storeWhatsAppSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().default('https://marthi-tec.discloud.app'),
  instance: z.string().default('marthi'),
  apiKey: z.string().default('5E280C9D-239A-4D8B-A765-63D00C291331'),
  storeNumber: z.string().default('5524981244253'),
  notifyCustomer: z.boolean().default(true),
  locationLabel: z.string().optional().default(''),
});

export function normalizeInstanceName(raw?: string): string {
  const norm = (raw || '').trim();
  if (!norm || norm.includes('discloud.app') || norm.includes('http') || norm === 'marthi-tec') {
    return 'marthi';
  }
  return norm;
}

async function getStoreWhatsAppConfig(storeId: string): Promise<StoreWhatsAppConfig> {
  if (pool) {
    try {
      const res = await pool.query(`SELECT whatsapp_settings FROM stores WHERE id = $1`, [storeId]);
      if (res.rows.length > 0 && res.rows[0].whatsapp_settings) {
        const raw = typeof res.rows[0].whatsapp_settings === 'string'
          ? JSON.parse(res.rows[0].whatsapp_settings)
          : res.rows[0].whatsapp_settings;
        return {
          ...defaultWhatsAppConfig,
          ...raw,
          instance: normalizeInstanceName(raw?.instance),
        };
      }
    } catch (err) {
      console.warn('[whatsapp] Falha ao ler whatsapp_settings do banco:', err);
    }
  }

  const mem = memoryWhatsAppConfigs.get(storeId) || memoryWhatsAppConfigs.get('STR-DEMO-01') || { ...defaultWhatsAppConfig };
  return {
    ...mem,
    instance: normalizeInstanceName(mem.instance),
  };
}

// ── 1. Rotas de Configuração da Loja (Operações) ───────────────────────────

whatsappRouter.get('/api/v1/store/whatsapp-settings', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const config = await getStoreWhatsAppConfig(storeId);
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.put('/api/v1/store/whatsapp-settings', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const body = storeWhatsAppSchema.parse(req.body);
    const merged = {
      ...defaultWhatsAppConfig,
      ...body,
      instance: normalizeInstanceName(body.instance),
      baseUrl: body.baseUrl.replace(/\/$/, ''),
    };

    if (pool) {
      try {
        await pool.query(
          `UPDATE stores SET whatsapp_settings = $1::jsonb, updated_at = now() WHERE id = $2`,
          [JSON.stringify(merged), storeId],
        );
      } catch (err) {
        console.error('[whatsapp] Erro ao gravar whatsapp_settings no banco:', err);
      }
    }

    memoryWhatsAppConfigs.set(storeId, merged);
    res.json({ success: true, data: merged });
  } catch (error) {
    next(error);
  }
});

// ── 2. Rotas Operacionais (Status, QR Code, Desconectar, Teste) ─────────────

whatsappRouter.get('/api/v1/whatsapp/status', async (req: Request, res: Response) => {
  const storeId = req.header('x-store-id') || (typeof req.query.storeId === 'string' ? req.query.storeId : 'STR-DEMO-01');
  const cfg = await getStoreWhatsAppConfig(storeId);

  const baseUrl = cfg.baseUrl;
  const instance = normalizeInstanceName(cfg.instance);
  const apiKey = cfg.apiKey;
  const storeNumber = cfg.storeNumber;

  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      const errText = await response.text();
      res.json({
        success: true,
        connected: false,
        state: 'error',
        error: `HTTP ${response.status}: ${errText}`,
        instance,
        baseUrl,
        storeNumber,
      });
      return;
    }

    const data = await response.json();
    const state = data?.instance?.state || 'unknown';
    const connected = state === 'open';

    res.json({
      success: true,
      connected,
      state,
      instance,
      baseUrl,
      storeNumber,
    });
  } catch (error) {
    res.json({
      success: true,
      connected: false,
      state: 'offline',
      error: error instanceof Error ? error.message : 'Falha na conexão com a Evolution API.',
      instance,
      baseUrl,
      storeNumber,
    });
  }
});

const testMessageSchema = z.object({
  number: z.string().min(8, 'Número de telefone é obrigatório.'),
  message: z.string().optional(),
});

whatsappRouter.post('/api/v1/whatsapp/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { number, message } = testMessageSchema.parse(req.body);
    const storeId = req.header('x-store-id') || 'STR-DEMO-01';
    const cfg = await getStoreWhatsAppConfig(storeId);
    const instance = normalizeInstanceName(cfg.instance);

    const text = message?.trim() || '✅ *Marthi ERP*: Conexão com Evolution API ativa com sucesso!';
    const result = await sendEvolutionText(number, text, {
      baseUrl: cfg.baseUrl,
      instance,
      apiKey: cfg.apiKey,
    });

    if (!result.ok) {
      res.status(502).json({
        success: false,
        error: { message: 'Evolution API não pôde entregar a mensagem.', details: result.body },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        message: 'Mensagem de teste enviada com sucesso!',
        recipient: normalizeBrazilPhone(number),
        response: result.body,
      },
    });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.get('/api/v1/whatsapp/qrcode', async (req: Request, res: Response) => {
  const storeId = req.header('x-store-id') || (typeof req.query.storeId === 'string' ? req.query.storeId : 'STR-DEMO-01');
  const cfg = await getStoreWhatsAppConfig(storeId);

  const baseUrl = cfg.baseUrl;
  const instance = normalizeInstanceName(cfg.instance);
  const apiKey = cfg.apiKey;
  const forceNew = req.query.force === 'true' || req.query.forceNew === 'true';

  try {
    if (forceNew) {
      try {
        await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
          method: 'DELETE',
          headers: { apikey: apiKey },
        });
      } catch (logoutErr) {
        console.warn('[whatsapp] Aviso ao efetuar logout antes de gerar QR:', logoutErr);
      }
    }

    const response = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    const data = await response.json();

    const state = data?.instance?.state;
    const isAlreadyConnected = state === 'open' && !data?.base64 && !data?.qrcode?.base64 && !data?.code;

    res.json({
      success: true,
      alreadyConnected: isAlreadyConnected,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Erro ao obter QR Code.' },
    });
  }
});

whatsappRouter.post('/api/v1/whatsapp/disconnect', requireOrDemoAuth, async (req: Request, res: Response) => {
  const storeId = req.storeId || 'STR-DEMO-01';
  const cfg = await getStoreWhatsAppConfig(storeId);
  const baseUrl = cfg.baseUrl;
  const instance = normalizeInstanceName(cfg.instance);
  const apiKey = cfg.apiKey;

  try {
    const response = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    });
    const data = await response.json();
    res.json({ success: true, message: 'WhatsApp desconectado da instância com sucesso.', data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Falha ao desconectar WhatsApp.' },
    });
  }
});

