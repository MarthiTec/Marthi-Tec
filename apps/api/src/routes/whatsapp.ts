import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sendEvolutionText, normalizeBrazilPhone } from '../services/evolutionWhatsApp.js';

export const whatsappRouter = Router();

whatsappRouter.get('/api/v1/whatsapp/status', async (_req, res) => {
  const baseUrl = env.EVOLUTION_BASE_URL?.replace(/\/$/, '') || 'https://marthi-tec.discloud.app';
  const instance = env.EVOLUTION_INSTANCE || 'marthi';
  const apiKey = env.EVOLUTION_API_KEY || '5E280C9D-239A-4D8B-A765-63D00C291331';
  const storeNumber = env.EVOLUTION_STORE_NUMBER || '5524981244253';

  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
      },
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

whatsappRouter.post('/api/v1/whatsapp/test', async (req, res, next) => {
  try {
    const { number, message } = testMessageSchema.parse(req.body);
    const text = message?.trim() || '✅ *Marthi ERP*: Conexão com Evolution API ativa com sucesso!';
    const result = await sendEvolutionText(number, text);

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

whatsappRouter.get('/api/v1/whatsapp/qrcode', async (_req, res) => {
  const baseUrl = env.EVOLUTION_BASE_URL?.replace(/\/$/, '') || 'https://marthi-tec.discloud.app';
  const instance = env.EVOLUTION_INSTANCE || 'marthi';
  const apiKey = env.EVOLUTION_API_KEY || '5E280C9D-239A-4D8B-A765-63D00C291331';

  try {
    const response = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
      },
    });

    const data = await response.json();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Erro ao obter QR Code.' },
    });
  }
});
