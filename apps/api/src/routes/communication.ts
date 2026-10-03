import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { requireOrDemoAuth } from '../middlewares/authMiddleware.js';

export const communicationRouter = Router();

export type StoreSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

const defaultSmtpConfig: StoreSmtpConfig = {
  enabled: true,
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: env.SMTP_PORT || 465,
  secure: env.SMTP_SECURE || true,
  user: env.SMTP_USER || '',
  pass: env.SMTP_PASS || '',
  from: env.SMTP_FROM || 'Marthi Tecnologia <marthi.tecnologia@gmail.com>',
};

const memoryStoreSmtpConfigs = new Map<string, StoreSmtpConfig>([
  ['STR-DEMO-01', { ...defaultSmtpConfig }],
]);

const storeSmtpSchema = z.object({
  enabled: z.boolean().default(true),
  host: z.string().min(1, 'Host SMTP é obrigatório.'),
  port: z.coerce.number().default(465),
  secure: z.boolean().default(true),
  user: z.string().min(1, 'Usuário SMTP é obrigatório.'),
  pass: z.string().optional().default(''),
  from: z.string().min(1, 'Remetente (FROM) é obrigatório.'),
});

export async function getStoreSmtpConfig(storeId: string): Promise<StoreSmtpConfig> {
  if (pool) {
    try {
      const res = await pool.query(`SELECT smtp_settings FROM stores WHERE id = $1`, [storeId]);
      if (res.rows.length > 0 && res.rows[0].smtp_settings) {
        const raw = typeof res.rows[0].smtp_settings === 'string'
          ? JSON.parse(res.rows[0].smtp_settings)
          : res.rows[0].smtp_settings;
        return {
          ...defaultSmtpConfig,
          ...raw,
        };
      }
    } catch (err) {
      throw err;
    }
  }

  return memoryStoreSmtpConfigs.get(storeId) || memoryStoreSmtpConfigs.get('STR-DEMO-01') || { ...defaultSmtpConfig };
}

// ── GET /api/v1/store/smtp-settings ──────────────────────────────────────────
communicationRouter.get('/api/v1/store/smtp-settings', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const config = await getStoreSmtpConfig(storeId);
    // Mascara a senha para visualização no front
    const safe = {
      ...config,
      hasPassword: Boolean(config.pass),
      pass: config.pass ? '••••••••' : '',
    };
    res.json({ success: true, data: safe });
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/v1/store/smtp-settings ──────────────────────────────────────────
communicationRouter.put('/api/v1/store/smtp-settings', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const body = storeSmtpSchema.parse(req.body);

    const current = await getStoreSmtpConfig(storeId);
    // Se a senha veio como bolinhas ou vazia e já existia senha salva, mantém a atual
    const effectivePass = (body.pass && !body.pass.includes('••')) ? body.pass : current.pass;

    const merged: StoreSmtpConfig = {
      enabled: body.enabled,
      host: body.host.trim(),
      port: Number(body.port) || 465,
      secure: Boolean(body.secure),
      user: body.user.trim(),
      pass: effectivePass,
      from: body.from.trim(),
    };

    if (pool) {
      try {
        await pool.query(
          `UPDATE stores SET smtp_settings = $1::jsonb, updated_at = now() WHERE id = $2`,
          [JSON.stringify(merged), storeId],
        );
      } catch (err) {
        throw err;
      }
    }

    memoryStoreSmtpConfigs.set(storeId, merged);

    res.json({
      success: true,
      data: {
        ...merged,
        hasPassword: Boolean(merged.pass),
        pass: merged.pass ? '••••••••' : '',
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/v1/store/smtp-settings/test ─────────────────────────────────────
const testEmailSchema = z.object({
  recipient: z.string().email('E-mail destinatário inválido.'),
  host: z.string().optional(),
  port: z.coerce.number().optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  pass: z.string().optional(),
  from: z.string().optional(),
});

communicationRouter.post('/api/v1/store/smtp-settings/test', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = testEmailSchema.parse(req.body);
    const storeId = req.storeId || 'STR-DEMO-01';
    const saved = await getStoreSmtpConfig(storeId);

    const host = body.host?.trim() || saved.host || env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(body.port) || saved.port || env.SMTP_PORT || 465;
    const secure = body.secure !== undefined ? Boolean(body.secure) : (saved.secure !== undefined ? saved.secure : true);
    const user = body.user?.trim() || saved.user || env.SMTP_USER || '';
    const pass = (body.pass && !body.pass.includes('••')) ? body.pass : (saved.pass || env.SMTP_PASS || '');
    const from = body.from?.trim() || saved.from || env.SMTP_FROM || 'Marthi Tecnologia <marthi.tecnologia@gmail.com>';

    if (!user || !pass) {
      res.status(400).json({
        success: false,
        error: { message: 'Usuário (SMTP_USER) e Senha (SMTP_PASS) são obrigatórios para testar o envio.' },
      });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from,
      to: body.recipient,
      subject: 'Teste de Configuração de E-mail — Marthi Tecnologia',
      text: `Olá!\n\nEste é um e-mail de teste enviado com sucesso a partir do servidor SMTP configurado na Marthi Tecnologia.\nHost: ${host}:${port}\nRemetente: ${from}\nData: ${new Date().toLocaleString('pt-BR')}`,
      html: `
        <div style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px; max-width: 520px; border: 1px solid rgba(255,255,255,0.1);">
          <h2 style="color: #2dd4bf; margin-top: 0;">✅ Conexão SMTP Confirmada!</h2>
          <p>Olá! Este é um e-mail de teste disparado com sucesso a partir do painel da sua loja na <strong>Marthi Tecnologia</strong>.</p>
          <ul style="background: rgba(255,255,255,0.06); padding: 16px 24px; border-radius: 8px; line-height: 1.8;">
            <li><strong>Servidor Host:</strong> <code>${host}:${port}</code></li>
            <li><strong>Conexão Segura:</strong> ${secure ? 'SSL / TLS (Ativo)' : 'Não segura / STARTTLS'}</li>
            <li><strong>Remetente (FROM):</strong> ${from}</li>
            <li><strong>Data do Envio:</strong> ${new Date().toLocaleString('pt-BR')}</li>
          </ul>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 0;">Agora seu sistema está preparado para enviar pedidos, recibos e notificações para seus clientes.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      data: {
        message: `E-mail de teste enviado com sucesso para ${body.recipient}!`,
        messageId: info.messageId,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(502).json({
      success: false,
      error: { message: `Falha no teste SMTP: ${msg}` },
    });
  }
});
