import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { readStoreCommunication } from './storeCommunication.js';
import { beginDelivery, finishDelivery } from './communicationAudit.js';

function getMailTransporter() {
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  let host = env.SMTP_HOST || '';
  let port = env.SMTP_PORT || 587;
  let secure = env.SMTP_SECURE || false;

  if (!host && user.toLowerCase().endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
    port = 465;
    secure = true;
  }

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: { rejectUnauthorized: true },
      connectionTimeout:15000, greetingTimeout:15000, socketTimeout:20000,
    });
  }
  return null;
}

export type WelcomeEmailPayload = {
  toEmail: string;
  contactName: string;
  companyName: string;
  planName: string;
  monthlyAmount?: number;
  activationToken: string;
  frontendUrl?: string;
};

export type InternalNotificationPayload = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  planName: string;
  monthlyAmount?: number;
  paymentMethod: string;
  paymentStatus: string;
  contractedAt: string;
  transactionRef?: string;
  clientId: string;
  frontendUrl?: string;
};

export type SignupReceivedEmailPayload = {
  toEmail: string;
  contactName: string;
  companyName: string;
  planName: string;
  monthlyAmount?: number;
  paymentMethod: string;
  protocol: string;
  frontendUrl?: string;
};

export type ResetPasswordEmailPayload = {
  toEmail: string;
  userName: string;
  resetToken: string;
  frontendUrl?: string;
};

/**
 * Template base responsivo com identidade visual elegante da Marthi Tecnologia
 */
export function wrapEmailTemplate(contentHtml: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Marthi Tecnologia</title></head>
<body bgcolor="#f1f5f9" style="margin:0;padding:0;background-color:#f1f5f9;color:#20333d;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f1f5f9" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="580" cellspacing="0" cellpadding="0" style="width:100%;max-width:580px;">
<tr><td bgcolor="#ffffff" style="padding:24px 28px;border:1px solid #dbe4e9;border-bottom:3px solid #0f766e;color:#14343d;font-size:22px;font-weight:bold;">MARTHI <span style="color:#0f766e;">TECNOLOGIA</span></td></tr>
<tr><td bgcolor="#ffffff" style="padding:28px;border:1px solid #dbe4e9;border-top:0;background-color:#ffffff;color:#20333d;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="color:#20333d;font-size:15px;line-height:1.6;">${contentHtml}</table>
</td></tr>
<tr><td align="center" style="padding:20px 12px;color:#526775;font-size:12px;line-height:1.6;">Marthi Tecnologia · Autoatendimento e gestão<br>Mensagem automática. Para atendimento, use os canais de suporte da sua empresa.</td></tr>
</table></td></tr></table></body></html>`;
}


/**
 * 1. E-mail de Boas-Vindas para o Cliente com Criação de Senha
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const baseUrl = env.FRONTEND_URL;
  const setupUrl = `${baseUrl.replace(/\/$/, '')}/criar-senha?token=${encodeURIComponent(payload.activationToken)}`;
  const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`;

  const contentHtml = `
    <tr>
      <td>
        <h1 style="color:#20333d; font-size:22px; margin:0 0 16px; font-weight:700;">
          Seja muito bem-vindo à Marthi Tecnologia! 🚀
        </h1>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 16px;">
          Olá, <strong style="color:#20333d;">${escapeHtml(payload.contactName)}</strong>!
        </p>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 20px;">
          Parabéns pelo seu investimento e obrigado por confiar em nossa tecnologia para impulsionar a operação de <strong style="color:#0f766e;">${escapeHtml(payload.companyName)}</strong>.
        </p>
        
        <!-- Detalhes do Plano -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f7f6; border:1px solid rgba(45, 212, 191, 0.2); border-radius:8px; padding:16px; margin-bottom:24px;">
          <tr>
            <td>
              <p style="margin:0 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:#526775;">Plano Contratado</p>
              <p style="margin:0 0 12px; font-size:18px; font-weight:700; color:#0f766e;">${escapeHtml(payload.planName)}</p>
              <p style="margin:0; font-size:13px; color:#465c68;">
                Status do Pagamento: <strong style="color:#15803d;">✓ Confirmado com Sucesso</strong>
              </p>
            </td>
          </tr>
        </table>

        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 20px;">
          Sua conta já foi criada e seu ambiente está preparado. Por motivos de segurança, não geramos senhas automáticas em texto puro. Para começar, basta definir sua senha pessoal clicando no botão abaixo:
        </p>

        <!-- Botão CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
          <tr>
            <td align="center">
              <a href="${setupUrl}" target="_blank" style="display:inline-block; background-color:#0f766e; color:#ffffff; font-weight:700; font-size:16px; padding:14px 32px; border-radius:8px; text-align:center; text-decoration:none; box-shadow:0 4px 14px rgba(45, 212, 191, 0.4);">
                Criar Minha Senha de Acesso →
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:13px; color:#526775; line-height:1.5; margin:0 0 16px;">
          Este link é de uso único e possui validade por questões de segurança. Caso o botão não funcione, copie e cole o link a seguir no seu navegador:<br>
          <a href="${setupUrl}" style="color:#0f766e; word-break:break-all; font-size:12px;">${setupUrl}</a>
        </p>

        <hr style="border:0; border-top:1px solid rgba(148, 163, 184, 0.15); margin:24px 0;">

        <p style="font-size:13px; color:#526775; margin:0;">
          Após definir sua senha, seu login poderá ser feito diretamente em:<br>
          <a href="${loginUrl}" target="_blank" style="color:#0f766e; font-weight:600;">${loginUrl}</a>
        </p>
      </td>
    </tr>
  `;

  const html = wrapEmailTemplate(
    contentHtml,
    `Seja bem-vindo à Marthi Tecnologia! Seu plano ${escapeHtml(payload.planName)} foi ativado. Crie sua senha de acesso.`
  );

  return sendMail({
    to: payload.toEmail,
    subject: `Seja muito bem-vindo à Marthi Tecnologia! — Ativação da sua conta (${payload.planName})`,
    html,
    text: `Olá ${payload.contactName},\n\nParabéns pela contratação do plano ${payload.planName} para ${payload.companyName}.\nSeu pagamento foi confirmado.\n\nPara definir sua senha de acesso com segurança, acesse o link:\n${setupUrl}\n\nApós criar sua senha, seu acesso é liberado em:\n${loginUrl}\n\nMarthi Tecnologia`,
  });
}

/**
 * 2. E-mail Interno para a Equipe Marthi Tecnologia (marthi.tecnologia@gmail.com)
 */
export async function sendInternalNotificationEmail(payload: InternalNotificationPayload): Promise<{ success: boolean; messageId?: string }> {
  const baseUrl = env.FRONTEND_URL;
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin/clientes`;

  const contentHtml = `
    <tr>
      <td>
        <div style="display:inline-block; background:rgba(45, 212, 191, 0.15); color:#0f766e; font-size:12px; font-weight:700; padding:4px 10px; border-radius:4px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
          Novo Cliente Confirmado
        </div>
        <h1 style="color:#20333d; font-size:20px; margin:0 0 16px; font-weight:700;">
          Nova Contratação Concluída! 🎯
        </h1>
        <p style="font-size:14px; line-height:1.6; color:#465c68; margin:0 0 20px;">
          Um novo parceiro concluiu a contratação de plano no sistema Marthi Tecnologia.
        </p>

        <!-- Ficha do Cliente -->
        <table width="100%" cellpadding="8" cellspacing="0" role="presentation" style="background:#f0f7f6; border:1px solid rgba(148, 163, 184, 0.2); border-radius:8px; font-size:14px; margin-bottom:24px;">
          <tr>
            <td style="color:#526775; width:40%;">Cliente / Empresa:</td>
            <td style="color:#20333d; font-weight:600;">${escapeHtml(payload.companyName)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Responsável:</td>
            <td style="color:#20333d;">${escapeHtml(payload.contactName)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">E-mail:</td>
            <td style="color:#0f766e;">${escapeHtml(payload.email)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Telefone / WhatsApp:</td>
            <td style="color:#20333d;">${escapeHtml(payload.phone)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Plano Adquirido:</td>
            <td style="color:#0f766e; font-weight:700;">${escapeHtml(payload.planName)}</td>
          </tr>
          ${payload.monthlyAmount ? `<tr><td style="color:#526775;">Valor Mensal:</td><td style="color:#20333d;">R$ ${payload.monthlyAmount.toFixed(2)}</td></tr>` : ''}
          <tr>
            <td style="color:#526775;">Forma de Pagamento:</td>
            <td style="color:#20333d;">${escapeHtml(payload.paymentMethod)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Status do Pagamento:</td>
            <td style="color:#15803d; font-weight:600;">${escapeHtml(payload.paymentStatus)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Data / Hora:</td>
            <td style="color:#20333d;">${new Date(payload.contractedAt).toLocaleString('pt-BR')}</td>
          </tr>
          <tr>
            <td style="color:#526775;">ID Cliente / Protocolo:</td>
            <td style="color:#20333d; font-family:monospace;">${escapeHtml(payload.clientId)}${payload.transactionRef ? ` · Transação: ${escapeHtml(payload.transactionRef)}` : ''}</td>
          </tr>
        </table>

        <!-- Link Direto para o Admin -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;">
          <tr>
            <td align="center">
              <a href="${adminUrl}" target="_blank" style="display:inline-block; background-color:#0f766e; color:#ffffff; font-weight:600; font-size:15px; padding:12px 28px; border-radius:8px; text-decoration:none; border:1px solid rgba(255,255,255,0.15);">
                Acessar Cadastro no /admin →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const html = wrapEmailTemplate(
    contentHtml,
    `Nova contratação: ${escapeHtml(payload.companyName)} adquiriu o plano ${escapeHtml(payload.planName)}.`
  );

  const recipient = env.INTERNAL_NOTIFICATION_EMAIL;
  if (!recipient) throw Object.assign(new Error('Destinatário das notificações internas não configurado.'), {status: 503});

  return sendMail({
    to: recipient,
    subject: `Novo cliente cadastrado — ${payload.companyName} — [${payload.planName}]`,
    html,
    text: `Nova contratação de plano!\n\nCliente: ${payload.companyName}\nResponsável: ${payload.contactName}\nE-mail: ${payload.email}\nTelefone: ${payload.phone}\nPlano: ${payload.planName}\nForma: ${payload.paymentMethod}\nStatus: ${payload.paymentStatus}\nID: ${payload.clientId}\n\nAcesse no painel:\n${adminUrl}`,
  });
}

/**
 * 3. E-mail de Recuperação de Senha ("Esqueci minha senha")
 */
export async function sendPasswordResetEmail(payload: ResetPasswordEmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const baseUrl = env.FRONTEND_URL;
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(payload.resetToken)}`;

  const contentHtml = `
    <tr>
      <td>
        <h1 style="color:#20333d; font-size:22px; margin:0 0 16px; font-weight:700;">
          Recuperação de Senha 🔒
        </h1>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 16px;">
          Olá, <strong style="color:#20333d;">${escapeHtml(payload.userName)}</strong>!
        </p>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 20px;">
          Recebemos uma solicitação para redefinir a senha da sua conta na Marthi Tecnologia. Se você fez essa solicitação, clique no botão abaixo para criar uma nova senha:
        </p>

        <!-- Botão CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
          <tr>
            <td align="center">
              <a href="${resetUrl}" target="_blank" style="display:inline-block; background-color:#0f766e; color:#ffffff; font-weight:700; font-size:16px; padding:14px 32px; border-radius:8px; text-align:center; text-decoration:none;">
                Redefinir Minha Senha →
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:13px; color:#526775; line-height:1.5; margin:0 0 16px;">
          Este link é de uso único e expira em 2 horas. Se você não solicitou a redefinição de senha, nenhuma ação é necessária e sua senha atual permanecerá segura.
        </p>
      </td>
    </tr>
  `;

  const html = wrapEmailTemplate(
    contentHtml,
    `Solicitação de redefinição de senha para sua conta na Marthi Tecnologia.`
  );

  return sendMail({
    to: payload.toEmail,
    subject: `Recuperação de Senha — Marthi Tecnologia`,
    html,
    text: `Olá ${payload.userName},\n\nRecebemos um pedido para redefinir a senha da sua conta.\n\nPara cadastrar uma nova senha, acesse:\n${resetUrl}\n\nEste link expira em 2 horas.\nSe você não solicitou, ignore este e-mail.\n\nMarthi Tecnologia`,
  });
}

import { pool } from '../db/pool.js';

async function recordEmailAudit(data: {
  recipient: string;
  subject: string;
  sender: string;
  status: 'sent' | 'failed' | 'simulated';
  messageId?: string;
  errorMessage?: string;
}) {
  if (pool) {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS audit_email_logs (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          subject TEXT NOT NULL,
          sender TEXT NOT NULL,
          status TEXT NOT NULL,
          message_id TEXT,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      );
      const id = `EML-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO audit_email_logs (id, recipient, subject, sender, status, message_id, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, data.recipient, data.subject, data.sender, data.status, data.messageId || null, data.errorMessage || null],
      );
    } catch {
      // ignore
    }
  }
}

export function isTestEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const testSuffixes = ['.teste', '.test', '.invalid', '.localhost', '.local', '.example'];
  const testDomains = ['@example.com', '@example.org', '@example.net', '@marthi.teste'];
  return testSuffixes.some((s) => normalized.endsWith(s)) || testDomains.some((d) => normalized.includes(d));
}

/**
 * Função de envio com suporte a Nodemailer SMTP com confirmação real do envio
 */
export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  storeId?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const config = options.storeId ? await readStoreCommunication(options.storeId, 'smtp_settings') : undefined;
  if (config && (!config.enabled || !config.host || !config.user || !config.pass || !config.from)) throw Object.assign(new Error('Configure e habilite o SMTP desta loja nas Operações.'), {status:503});
  const sender = config ? config.from : env.SMTP_FROM;
  const transporter = config ? nodemailer.createTransport({host:config.host, port:config.port, secure:config.secure, auth:{user:config.user,pass:config.pass}, tls:{rejectUnauthorized:true}, connectionTimeout:15000, greetingTimeout:15000, socketTimeout:20000}) : getMailTransporter();
  const deliveryId = await beginDelivery(options.storeId, 'email', options.to);

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: sender,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      if (info.rejected?.length || (Array.isArray(info.accepted) && !info.accepted.length)) throw new Error('SMTP recusou o destinatário.');
      await finishDelivery(deliveryId, 'accepted', undefined, info.messageId);
      console.log(`[emailService] E-mail enviado com sucesso via SMTP para ${options.to} (ID: ${info.messageId})`);
      await recordEmailAudit({
        recipient: options.to,
        subject: options.subject,
        sender,
        status: 'sent',
        messageId: info.messageId,
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      await finishDelivery(deliveryId, 'unknown');
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[emailService] Falha ao enviar via SMTP para ${options.to}:`, msg);
      await recordEmailAudit({
        recipient: options.to,
        subject: options.subject,
        sender: env.SMTP_FROM,
        status: 'failed',
        errorMessage: msg,
      });
    }
  }

  throw Object.assign(new Error('Envio de e-mail indisponível. Verifique a configuração SMTP.'), { status: 503 });

}

/**
 * Função de diagnóstico para validar conexão e credenciais SMTP em runtime
 */
export async function verifySmtpConfig(testRecipient?: string): Promise<{
  configured: boolean;
  connected: boolean;
  host?: string;
  port?: number;
  user?: string;
  sendResult?: { success: boolean; messageId?: string; error?: string };
  error?: string;
}> {
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  let host = env.SMTP_HOST || '';
  let port = env.SMTP_PORT || 587;
  let secure = env.SMTP_SECURE || false;

  if (!host && user.toLowerCase().endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
    port = 465;
    secure = true;
  }

  if (!user || !pass) {
    return {
      configured: false,
      connected: false,
      error: 'SMTP_USER ou SMTP_PASS não configurados nas variáveis de ambiente da aplicação.',
    };
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      configured: false,
      connected: false,
      error: 'Não foi possível instanciar o transporte Nodemailer.',
    };
  }

  try {
    await transporter.verify();

    let sendResult = undefined;
    if (testRecipient) {
      try {
        const sent = await sendMail({
          to: testRecipient,
          subject: 'Teste de Configuração de E-mail — Marthi Tecnologia',
          text: `Olá! Este é um e-mail de teste disparado pelo sistema Marthi Tecnologia para validar a conexão SMTP.\nData: ${new Date().toLocaleString('pt-BR')}`,
          html: `<p>Olá!</p><p>Este é um e-mail de teste disparado pelo sistema <strong>Marthi Tecnologia</strong> para validar a conexão SMTP.</p><p><small>Data: ${new Date().toLocaleString('pt-BR')}</small></p>`,
        });
        sendResult = { success: sent.success, messageId: sent.messageId };
      } catch (sendErr) {
        sendResult = {
          success: false,
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        };
      }
    }

    return {
      configured: true,
      connected: true,
      host,
      port,
      user,
      sendResult,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      host,
      port,
      user,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 5. E-mail de Recebimento de Contratação (Aguardando Confirmação do Pagamento Pix)
 */
export async function sendSignupReceivedEmail(payload: SignupReceivedEmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const contentHtml = `
    <tr>
      <td>
        <div style="display:inline-block; background:rgba(45, 212, 191, 0.15); color:#0f766e; font-size:12px; font-weight:700; padding:4px 10px; border-radius:4px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
          Contratação Registrada
        </div>
        <h1 style="color:#20333d; font-size:22px; margin:0 0 16px; font-weight:700;">
          Recebemos sua contratação! 🎯
        </h1>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 16px;">
          Olá, <strong style="color:#20333d;">${escapeHtml(payload.contactName)}</strong>!
        </p>
        <p style="font-size:15px; line-height:1.6; color:#465c68; margin:0 0 20px;">
          Seu pedido de contratação do plano <strong style="color:#0f766e;">${escapeHtml(payload.planName)}</strong> para a empresa <strong style="color:#20333d;">${escapeHtml(payload.companyName)}</strong> foi registrado com sucesso em nossa plataforma.
        </p>
        
        <!-- Detalhes do Pedido -->
        <table width="100%" cellpadding="8" cellspacing="0" role="presentation" style="background:#f0f7f6; border:1px solid rgba(45, 212, 191, 0.2); border-radius:8px; font-size:14px; margin-bottom:24px;">
          <tr>
            <td style="color:#526775; width:40%;">Empresa:</td>
            <td style="color:#20333d; font-weight:600;">${escapeHtml(payload.companyName)}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Plano Escolhido:</td>
            <td style="color:#0f766e; font-weight:700;">${escapeHtml(payload.planName)}</td>
          </tr>
          ${payload.monthlyAmount ? `<tr><td style="color:#526775;">Valor Mensal:</td><td style="color:#20333d;">R$ ${payload.monthlyAmount.toFixed(2)}</td></tr>` : ''}
          <tr>
            <td style="color:#526775;">Forma de Pagamento:</td>
            <td style="color:#20333d;">${payload.paymentMethod.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="color:#526775;">Status Atual:</td>
            <td style="color:#f59e0b; font-weight:600;">Aguardando Confirmação do Pagamento</td>
          </tr>
          <tr>
            <td style="color:#526775;">Protocolo:</td>
            <td style="color:#20333d; font-family:monospace;">${escapeHtml(payload.protocol)}</td>
          </tr>
        </table>

        <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); border-radius:8px; padding:16px; margin-bottom:24px;">
          <p style="font-size:14px; line-height:1.6; color:#fde68a; margin:0;">
            ⏳ <strong>Próximo Passo — Liberação de Acesso:</strong><br>
            Assim que nosso time confirmar o recebimento do pagamento Pix, seu acesso será liberado no sistema e você receberá um novo e-mail contendo o link exclusivo e seguro para criar sua senha de acesso.
          </p>
        </div>

        <p style="font-size:13px; color:#526775; margin:0;">
          Dúvidas? Entre em contato pelo WhatsApp de suporte ou responda a este e-mail.<br>
          <strong>Equipe Marthi Tecnologia</strong>
        </p>
      </td>
    </tr>
  `;

  const html = wrapEmailTemplate(
    contentHtml,
    `Recebemos seu pedido de contratação do plano ${escapeHtml(payload.planName)} para ${escapeHtml(payload.companyName)}.`
  );

  return sendMail({
    to: payload.toEmail,
    subject: `Recebemos sua contratação — ${payload.companyName} (${payload.planName})`,
    html,
    text: `Olá ${payload.contactName},\n\nRecebemos seu pedido de contratação do plano ${payload.planName} para a empresa ${payload.companyName}.\nProtocolo: ${payload.protocol}\nStatus: Aguardando confirmação do pagamento Pix.\n\nAssim que o pagamento for confirmado pela equipe, você receberá seu link exclusivo de ativação para criar sua senha.\n\nMarthi Tecnologia`,
  });
}



export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
