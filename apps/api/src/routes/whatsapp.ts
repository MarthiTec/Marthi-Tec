import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { sendEvolutionText, normalizeBrazilPhone } from '../services/evolutionWhatsApp.js';

import { getStoreWhatsAppConfig, saveStoreCommunication, requireCommunicationAdmin } from '../services/storeCommunication.js';
export const whatsappRouter = Router();
whatsappRouter.use('/api/v1/whatsapp', requireAuth, requireCommunicationAdmin);
whatsappRouter.use('/api/v1/store/whatsapp-settings', requireAuth, requireCommunicationAdmin);
const safeConfig = (cfg: StoreWhatsAppConfig) => ({...cfg, apiKey: cfg.apiKey ? '••••••••' : ''});

export type StoreWhatsAppConfig = {
  enabled: boolean;
  baseUrl: string;
  instance: string;
  apiKey: string;
  storeNumber: string;
  notifyCustomer: boolean;
  locationLabel: string;
};

const storeWhatsAppSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().trim().default(''),
  instance: z.string().trim().default(''),
  apiKey: z.string().default(''),
  storeNumber: z.string().default(''),
  notifyCustomer: z.boolean().default(true),
  locationLabel: z.string().optional().default(''),
});

export function normalizeInstanceName(raw?: string): string { return (raw || '').trim(); }
// ── 1. Rotas de Configuração da Loja (Operações) ───────────────────────────

whatsappRouter.get('/api/v1/store/whatsapp-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId!;
    const config = await getStoreWhatsAppConfig(storeId);
    res.json({ success: true, data: safeConfig(config) });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.put('/api/v1/store/whatsapp-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId!;
    const body = storeWhatsAppSchema.parse(req.body);
    const merged = {
      ...await getStoreWhatsAppConfig(storeId),
      ...body,
      instance: normalizeInstanceName(body.instance),
      baseUrl: body.baseUrl.replace(/\/$/, ''),
    };

    const current = await getStoreWhatsAppConfig(storeId);
    merged.apiKey = !body.apiKey || body.apiKey.includes('••') ? current.apiKey : body.apiKey.trim();
    if (merged.enabled && (!merged.baseUrl || !merged.instance || !merged.apiKey)) throw Object.assign(new Error('Informe URL, instância e chave do Evolution.'), { status: 400 });
    if (merged.baseUrl) {
      const url = new URL(merged.baseUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error('URL do Evolution inválida.'), { status: 400 });
    }
    await saveStoreCommunication(storeId, 'whatsapp_settings', merged);
    res.json({ success: true, data: safeConfig(merged) });
  } catch (error) {
    next(error);
  }
});

// ── 2. Rotas Operacionais (Status, QR Code, Desconectar, Teste) ─────────────

whatsappRouter.get('/api/v1/whatsapp/status', async (req: Request, res: Response, next: NextFunction) => {
 try {
  const storeId = req.storeId!;
  const cfg = await getStoreWhatsAppConfig(storeId);

  const baseUrl = cfg.baseUrl;
  const instance = normalizeInstanceName(cfg.instance);
  const apiKey = cfg.apiKey;
  const storeNumber = cfg.storeNumber;

  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });

    if (!response.ok) {

      res.json({success:true,data:{
        success: true,
        connected: false,
        state: 'error',
        error: `Evolution indisponível (HTTP ${response.status}).`,
        instance,
        baseUrl,
        storeNumber,
      }});
      return;
    }

    if (!response.ok) throw new Error(`Evolution recusou a operação (HTTP ${response.status}).`);
    if (!response.ok) throw new Error(`Evolution recusou a operação (HTTP ${response.status}).`);
    const data = await response.json();
    const state = data?.instance?.state || 'unknown';
    const connected = state === 'open';

    res.json({success:true,data:{
      success: true,
      connected,
      state,
      instance,
      baseUrl,
      storeNumber,
    }});
  } catch (error) {
    res.json({success:true,data:{
      success: true,
      connected: false,
      state: 'offline',
      error: error instanceof Error ? error.message : 'Falha na conexão com a Evolution API.',
      instance,
      baseUrl,
      storeNumber,
    }});
  }
 } catch (error) { next(error); }
});

const testMessageSchema = z.object({
  number: z.string().min(8, 'Número de telefone é obrigatório.'),
  message: z.string().optional(),
});

whatsappRouter.post('/api/v1/whatsapp/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { number, message } = testMessageSchema.parse(req.body);
    const storeId = req.storeId!;
    const cfg = await getStoreWhatsAppConfig(storeId);
    if (!cfg.enabled) throw Object.assign(new Error('WhatsApp desativado nesta loja.'), {status:400});
    const instance = normalizeInstanceName(cfg.instance);

    const text = message?.trim() || '✅ *Marthi ERP*: Conexão com Evolution API ativa com sucesso!';
    const result = await sendEvolutionText(number, text, {
      baseUrl: cfg.baseUrl,
      instance,
      apiKey: cfg.apiKey, storeId,
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
        message: 'Mensagem de teste aceita pelo Evolution.',
        recipient: normalizeBrazilPhone(number),
        response: result.body,
      },
    });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.get('/api/v1/whatsapp/qrcode', async (req: Request, res: Response, next: NextFunction) => {
 try {
  const storeId = req.storeId!;
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
          headers: { apikey: apiKey }, signal: AbortSignal.timeout(15000), redirect: 'error',
        });
      } catch (logoutErr) {
        console.warn('[whatsapp] Aviso ao efetuar logout antes de gerar QR:', logoutErr);
      }
    }

    const response = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: { apikey: apiKey }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });

    if (!response.ok) throw new Error(`Evolution recusou a operação (HTTP ${response.status}).`);
    const data = await response.json();

    const state = data?.instance?.state;
    const isAlreadyConnected = state === 'open' && !data?.base64 && !data?.qrcode?.base64 && !data?.code;

    res.json({success:true,data:{
      success: true,
      alreadyConnected: isAlreadyConnected,
      data,
    }});
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Erro ao obter QR Code.' },
    });
  }
 } catch (error) { next(error); }
});

whatsappRouter.post('/api/v1/whatsapp/disconnect', async (req: Request, res: Response, next: NextFunction) => {
 try {
  const storeId = req.storeId!;
  const cfg = await getStoreWhatsAppConfig(storeId);
  const baseUrl = cfg.baseUrl;
  const instance = normalizeInstanceName(cfg.instance);
  const apiKey = cfg.apiKey;

  try {
    const response = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
      method: 'DELETE',
      headers: { apikey: apiKey }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Evolution recusou a operação (HTTP ${response.status}).`);
    const data = await response.json();
    res.json({success:true,data:{ success: true, message: 'WhatsApp desconectado da instância com sucesso.', data }});
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Falha ao desconectar WhatsApp.' },
    });
  }
 } catch (error) { next(error); }
});

