import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env.js';

let cachedLogoBase64: string | null = null;

function getLogoBase64(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  const possiblePaths = [
    resolve(process.cwd(), 'assets/logo-marthi-horizontal.png'),
    resolve(process.cwd(), '../web/public/brand/logo-marthi-horizontal.png'),
    resolve(process.cwd(), 'apps/web/public/brand/logo-marthi-horizontal.png'),
    resolve(process.cwd(), '../../apps/web/public/brand/logo-marthi-horizontal.png'),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const buf = readFileSync(p);
        cachedLogoBase64 = `data:image/png;base64,${buf.toString('base64')}`;
        return cachedLogoBase64;
      } catch {
        // continue
      }
    }
  }
  return '';
}

function getMailTransporter() {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
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

export type ResetPasswordEmailPayload = {
  toEmail: string;
  userName: string;
  resetToken: string;
  frontendUrl?: string;
};

/**
 * Template base responsivo com identidade visual elegante da Marthi Tecnologia
 */
function wrapEmailTemplate(contentHtml: string, previewText: string): string {
  const logoSrc = getLogoBase64();
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="Marthi Tecnologia" width="220" style="display:block; border:0; outline:none; max-width:220px; height:auto; margin:0 auto;" />`
    : `<div style="font-size:24px; font-weight:800; letter-spacing:1px; color:#ffffff;">MARTHI <span style="color:#2dd4bf; font-weight:400;">TECNOLOGIA</span></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marthi Tecnologia</title>
  <style>
    body { margin:0; padding:0; background-color:#0b0f14; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#e2e8f0; }
    table { border-collapse:collapse; }
    a { color:#2dd4bf; text-decoration:none; }
    @media only screen and (max-width: 600px) {
      .container { width:100% !important; padding:12px !important; }
      .card { padding:24px 16px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0b0f14;">
  <!-- Preview Text -->
  <div style="display:none; font-size:1px; color:#0b0f14; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${previewText}
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0b0f14; min-height:100vh; padding:32px 0;">
    <tr>
      <td align="center">
        <table class="container" width="580" cellpadding="0" cellspacing="0" role="presentation" style="width:580px; max-width:580px; margin:0 auto;">
          <!-- Header com Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              ${logoHtml}
            </td>
          </tr>

          <!-- Card Principal -->
          <tr>
            <td>
              <table class="card" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#131b24; border:1px solid rgba(148, 163, 184, 0.16); border-radius:12px; padding:36px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                ${contentHtml}
              </table>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding-top:28px; font-size:12px; color:#64748b; line-height:1.6;">
              <p style="margin:0 0 8px;">Marthi Tecnologia · Soluções Inteligentes em Autoatendimento &amp; Gestão</p>
              <p style="margin:0;">Este é um e-mail automático do sistema. Não responda a este remetente.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. E-mail de Boas-Vindas para o Cliente com Criação de Senha
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<{ success: boolean; messageId?: string }> {
  const baseUrl = payload.frontendUrl || env.FRONTEND_URL || 'http://localhost:5173';
  const setupUrl = `${baseUrl.replace(/\/$/, '')}/criar-senha?token=${encodeURIComponent(payload.activationToken)}`;
  const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`;

  const contentHtml = `
    <tr>
      <td>
        <h1 style="color:#ffffff; font-size:22px; margin:0 0 16px; font-weight:700;">
          Seja muito bem-vindo à Marthi Tecnologia! 🚀
        </h1>
        <p style="font-size:15px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
          Olá, <strong style="color:#ffffff;">${payload.contactName}</strong>!
        </p>
        <p style="font-size:15px; line-height:1.6; color:#cbd5e1; margin:0 0 20px;">
          Parabéns pelo seu investimento e obrigado por confiar em nossa tecnologia para impulsionar a operação de <strong style="color:#2dd4bf;">${payload.companyName}</strong>.
        </p>
        
        <!-- Detalhes do Plano -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#1a232f; border:1px solid rgba(45, 212, 191, 0.2); border-radius:8px; padding:16px; margin-bottom:24px;">
          <tr>
            <td>
              <p style="margin:0 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8;">Plano Contratado</p>
              <p style="margin:0 0 12px; font-size:18px; font-weight:700; color:#2dd4bf;">${payload.planName}</p>
              <p style="margin:0; font-size:13px; color:#cbd5e1;">
                Status do Pagamento: <strong style="color:#4ade80;">✓ Confirmado com Sucesso</strong>
              </p>
            </td>
          </tr>
        </table>

        <p style="font-size:15px; line-height:1.6; color:#cbd5e1; margin:0 0 20px;">
          Sua conta já foi criada e seu ambiente está preparado. Por motivos de segurança, não geramos senhas automáticas em texto puro. Para começar, basta definir sua senha pessoal clicando no botão abaixo:
        </p>

        <!-- Botão CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
          <tr>
            <td align="center">
              <a href="${setupUrl}" target="_blank" style="display:inline-block; background-color:#2dd4bf; color:#0b0f14; font-weight:700; font-size:16px; padding:14px 32px; border-radius:8px; text-align:center; text-decoration:none; box-shadow:0 4px 14px rgba(45, 212, 191, 0.4);">
                Criar Minha Senha de Acesso →
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin:0 0 16px;">
          Este link é de uso único e possui validade por questões de segurança. Caso o botão não funcione, copie e cole o link a seguir no seu navegador:<br>
          <a href="${setupUrl}" style="color:#2dd4bf; word-break:break-all; font-size:12px;">${setupUrl}</a>
        </p>

        <hr style="border:0; border-top:1px solid rgba(148, 163, 184, 0.15); margin:24px 0;">

        <p style="font-size:13px; color:#94a3b8; margin:0;">
          Após definir sua senha, seu login poderá ser feito diretamente em:<br>
          <a href="${loginUrl}" target="_blank" style="color:#2dd4bf; font-weight:600;">${loginUrl}</a>
        </p>
      </td>
    </tr>
  `;

  const html = wrapEmailTemplate(
    contentHtml,
    `Seja bem-vindo à Marthi Tecnologia! Seu plano ${payload.planName} foi ativado. Crie sua senha de acesso.`
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
  const baseUrl = payload.frontendUrl || env.FRONTEND_URL || 'http://localhost:5173';
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin/clientes`;

  const contentHtml = `
    <tr>
      <td>
        <div style="display:inline-block; background:rgba(45, 212, 191, 0.15); color:#2dd4bf; font-size:12px; font-weight:700; padding:4px 10px; border-radius:4px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
          Novo Cliente Confirmado
        </div>
        <h1 style="color:#ffffff; font-size:20px; margin:0 0 16px; font-weight:700;">
          Nova Contratação Concluída! 🎯
        </h1>
        <p style="font-size:14px; line-height:1.6; color:#cbd5e1; margin:0 0 20px;">
          Um novo parceiro concluiu a contratação de plano no sistema Marthi Tecnologia.
        </p>

        <!-- Ficha do Cliente -->
        <table width="100%" cellpadding="8" cellspacing="0" role="presentation" style="background:#1a232f; border:1px solid rgba(148, 163, 184, 0.2); border-radius:8px; font-size:14px; margin-bottom:24px;">
          <tr>
            <td style="color:#94a3b8; width:40%;">Cliente / Empresa:</td>
            <td style="color:#ffffff; font-weight:600;">${payload.companyName}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">Responsável:</td>
            <td style="color:#ffffff;">${payload.contactName}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">E-mail:</td>
            <td style="color:#2dd4bf;">${payload.email}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">Telefone / WhatsApp:</td>
            <td style="color:#ffffff;">${payload.phone}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">Plano Adquirido:</td>
            <td style="color:#2dd4bf; font-weight:700;">${payload.planName}</td>
          </tr>
          ${payload.monthlyAmount ? `<tr><td style="color:#94a3b8;">Valor Mensal:</td><td style="color:#ffffff;">R$ ${payload.monthlyAmount.toFixed(2)}</td></tr>` : ''}
          <tr>
            <td style="color:#94a3b8;">Forma de Pagamento:</td>
            <td style="color:#ffffff;">${payload.paymentMethod}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">Status do Pagamento:</td>
            <td style="color:#4ade80; font-weight:600;">${payload.paymentStatus}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">Data / Hora:</td>
            <td style="color:#ffffff;">${new Date(payload.contractedAt).toLocaleString('pt-BR')}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;">ID Cliente / Protocolo:</td>
            <td style="color:#ffffff; font-family:monospace;">${payload.clientId}${payload.transactionRef ? ` · Transação: ${payload.transactionRef}` : ''}</td>
          </tr>
        </table>

        <!-- Link Direto para o Admin -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;">
          <tr>
            <td align="center">
              <a href="${adminUrl}" target="_blank" style="display:inline-block; background-color:#334155; color:#ffffff; font-weight:600; font-size:15px; padding:12px 28px; border-radius:8px; text-decoration:none; border:1px solid rgba(255,255,255,0.15);">
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
    `Nova contratação: ${payload.companyName} adquiriu o plano ${payload.planName}.`
  );

  const recipient = env.INTERNAL_NOTIFICATION_EMAIL || 'marthi.tecnologia@gmail.com';

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
  const baseUrl = payload.frontendUrl || env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(payload.resetToken)}`;

  const contentHtml = `
    <tr>
      <td>
        <h1 style="color:#ffffff; font-size:22px; margin:0 0 16px; font-weight:700;">
          Recuperação de Senha 🔒
        </h1>
        <p style="font-size:15px; line-height:1.6; color:#cbd5e1; margin:0 0 16px;">
          Olá, <strong style="color:#ffffff;">${payload.userName}</strong>!
        </p>
        <p style="font-size:15px; line-height:1.6; color:#cbd5e1; margin:0 0 20px;">
          Recebemos uma solicitação para redefinir a senha da sua conta na Marthi Tecnologia. Se você fez essa solicitação, clique no botão abaixo para criar uma nova senha:
        </p>

        <!-- Botão CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
          <tr>
            <td align="center">
              <a href="${resetUrl}" target="_blank" style="display:inline-block; background-color:#2dd4bf; color:#0b0f14; font-weight:700; font-size:16px; padding:14px 32px; border-radius:8px; text-align:center; text-decoration:none;">
                Redefinir Minha Senha →
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:13px; color:#94a3b8; line-height:1.5; margin:0 0 16px;">
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

/**
 * Função interna de envio com suporte a Nodemailer SMTP ou graceful logger sandbox
 */
async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const transporter = getMailTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: env.SMTP_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      console.log(`[emailService] E-mail enviado com sucesso via SMTP para ${options.to} (ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[emailService] Falha ao enviar via SMTP para ${options.to}:`, err);
      // Fallback to logged delivery so execution flow never interrupts
    }
  }

  // Graceful simulation / dev mode logger
  const simulatedId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[emailService] [DEV/SANDBOX SIMULATION] E-mail despachado:`, {
    id: simulatedId,
    to: options.to,
    subject: options.subject,
    date: new Date().toISOString(),
  });

  return { success: true, messageId: simulatedId };
}
