import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { beginDelivery, finishDelivery } from '../services/communicationAudit.js';
import { escapeHtml } from '../services/emailService.js';
import { readStoreCommunication, saveStoreCommunication, requireCommunicationAdmin } from '../services/storeCommunication.js';
import { pool } from '../db/pool.js';
import { requireOrDemoAuth } from '../middlewares/authMiddleware.js';

export const communicationRouter = Router();
communicationRouter.use('/api/v1/store/smtp-settings', requireOrDemoAuth, requireCommunicationAdmin);
communicationRouter.get('/api/v1/store/communication-deliveries', requireOrDemoAuth, requireCommunicationAdmin, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), {status:503});
    const result = await pool.query(`SELECT id,channel,recipient,status,provider_message_id,created_at FROM communication_delivery_logs WHERE store_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.storeId]);
    res.json({success:true,data:result.rows});
  } catch (error) { next(error); }
});

export type StoreSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

const defaultSmtpConfig: StoreSmtpConfig = {enabled: false, host: '', port: 465, secure: true, user: '', pass: '', from: ''};
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
 return {...defaultSmtpConfig, ...await readStoreCommunication(storeId, 'smtp_settings')};
}
// ── GET /api/v1/store/smtp-settings ──────────────────────────────────────────
communicationRouter.get('/api/v1/store/smtp-settings', requireOrDemoAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.storeId!;
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
    const storeId = req.storeId!;
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

    await saveStoreCommunication(storeId, 'smtp_settings', merged);

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
    const storeId = req.storeId!;
    const saved = await getStoreSmtpConfig(storeId);

    const host = body.host?.trim() || saved.host;
    const port = Number(body.port) || saved.port;
    const secure = body.secure !== undefined ? Boolean(body.secure) : (saved.secure !== undefined ? saved.secure : true);
    const user = body.user?.trim() || saved.user;
    const pass = (body.pass && !body.pass.includes('••')) ? body.pass : (saved.pass);
    const from = body.from?.trim() || saved.from;

    const missing = [!host && 'Servidor SMTP', !from && 'Remetente', !user && 'Usuário', !pass && 'Senha de app'].filter(Boolean);
    if (missing.length) {
      res.status(400).json({ success: false, error: { message: `Preencha a configuração de e-mail: ${missing.join(', ')}.` } });
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      res.status(400).json({ success: false, error: { message: 'Informe uma porta SMTP válida (1 a 65535).' } });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });

    await transporter.verify();

    const deliveryId = await beginDelivery(storeId, 'email', body.recipient);
    let info;
    try {
    info = await transporter.sendMail({
      from,
      to: body.recipient,
      subject: 'Teste de Configuração de E-mail — Marthi Tecnologia',
      text: `Olá!\n\nEste é um e-mail de teste enviado com sucesso a partir do servidor SMTP configurado na Marthi Tecnologia.\nHost: ${host}:${port}\nRemetente: ${from}\nData: ${new Date().toLocaleString('pt-BR')}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f7f9;color:#20333d"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="520" bgcolor="#ffffff" style="background:#ffffff;color:#20333d;font-family:Arial,sans-serif;padding:24px"><tr><td><h2 style="color:#0f766e">Teste de e-mail da sua loja</h2><p style="color:#20333d">O servidor SMTP aceitou esta mensagem.</p><p style="color:#20333d">Remetente: ${escapeHtml(from)}</p></td></tr></table></td></tr></table></body></html>`,
    });

    } catch (error) { await finishDelivery(deliveryId, 'unknown'); throw error; }
    if (!info.accepted?.length || info.rejected?.length) {
      await finishDelivery(deliveryId, 'failed');
      throw new Error('O servidor SMTP não aceitou o destinatário.');
    }
    await finishDelivery(deliveryId, 'accepted', undefined, info.messageId);
    res.json({
      success: true,
      data: {
        message: `E-mail de teste aceito pelo servidor SMTP para ${body.recipient}!`,
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
