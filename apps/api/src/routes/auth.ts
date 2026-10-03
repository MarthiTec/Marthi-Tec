import { Router } from 'express';
import { z } from 'zod';
import {
  activateStoredClientUser,
  adminForcePasswordReset,
  adminResendActivationLink,
  adminToggleUserAccess,
  getUserSecurityStatus,
  identifyUserAccess,
  loginWithGoogleIdToken,
  loginWithPassword,
  registerClientUser,
  requestFirstAccess,
  requestPasswordReset,
  resetPasswordWithToken,
  setupPasswordWithToken,
  verifySessionToken,
} from '../services/authService.js';
import { inspectToken } from '../services/tokenService.js';
import { sendPhoneOtp, verifyPhoneOtp } from '../services/otpService.js';
import { env } from '../config/env.js';

export const authRouter = Router();

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  idToken: z.string().min(10),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4, 'Senha deve ter no mínimo 4 caracteres.'),
  name: z.string().min(2, 'Informe o nome do responsável ou da empresa.'),
  tradeName: z.string().optional(),
  clientAccountId: z.string().optional(),
  role: z.enum(['admin', 'manager', 'operator', 'seller']).default('admin'),
});

const activateSchema = z.object({
  email: z.string().email(),
  paymentMethod: z.string().optional(),
  transactionRef: z.string().optional(),
});

const setupPasswordSchema = z.object({
  token: z.string().min(16, 'Token inválido.'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Token inválido.'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
});

const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Número de celular inválido.'),
  name: z.string().optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Número de celular inválido.'),
  code: z.string().length(6, 'O código deve ter exatamente 6 dígitos.'),
});

const adminActionSchema = z.object({
  email: z.string().email(),
  clientName: z.string().optional(),
  planName: z.string().optional(),
  active: z.boolean().optional(),
});

authRouter.get('/api/v1/auth/providers', (_req, res) => {
  res.json({
    success: true,
    data: {
      google: Boolean(env.GOOGLE_CLIENT_ID),
      password: true,
      googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    },
  });
});

const identifySchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

authRouter.post('/api/v1/auth/identify', async (req, res, next) => {
  try {
    const body = identifySchema.parse(req.body);
    const result = await identifyUserAccess(body.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/api/v1/auth/identify', async (req, res, next) => {
  try {
    const emailParam = typeof req.query.email === 'string' ? req.query.email : '';
    const body = identifySchema.parse({ email: emailParam });
    const result = await identifyUserAccess(body.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const body = passwordSchema.parse(req.body);
    const session = await loginWithPassword(body.email, body.password);
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/auth/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const session = await registerClientUser(body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/auth/activate', (req, res, next) => {
  try {
    const body = activateSchema.parse(req.body);
    const ok = activateStoredClientUser(body.email);
    res.json({
      success: true,
      data: {
        activated: ok,
        email: body.email,
        message: 'Acesso do cliente ativado com sucesso após confirmação do pagamento.',
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/auth/google', async (req, res, next) => {
  try {
    const body = googleSchema.parse(req.body);
    const session = await loginWithGoogleIdToken(body.idToken);
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

/**
 * Inspeciona token seguro (para criação de senha ou redefinição) antes do usuário preencher o formulário
 */
authRouter.get('/api/v1/auth/token/inspect', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const expectedType = req.query.type === 'password_reset' ? 'password_reset' : 'activation';

  const result = await inspectToken(token, expectedType);
  if (!result.valid || !result.record) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        reason: result.reason,
        message:
          result.reason === 'expired'
            ? 'Este link expirou. Por motivos de segurança, solicite um novo link.'
            : result.reason === 'already_used'
            ? 'Este link já foi utilizado para configurar sua senha.'
            : 'Link de verificação inválido ou inexistente.',
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      email: result.record.email,
      name: result.record.name || 'Cliente Marthi',
      type: result.record.type,
      expiresAt: result.record.expiresAt,
    },
  });
});

/**
 * Criação da senha inicial via token seguro de ativação
 */
authRouter.post('/api/v1/auth/setup-password', async (req, res, next) => {
  try {
    const body = setupPasswordSchema.parse(req.body);
    const result = await setupPasswordWithToken(body.token, body.password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

const firstAccessSchema = z.object({
  email: z.string().email(),
});

/**
 * Primeiro Acesso — Solicitação de link seguro de ativação e criação de senha inicial
 */
authRouter.post('/api/v1/auth/first-access', async (req, res, next) => {
  try {
    const body = firstAccessSchema.parse(req.body);
    const result = await requestFirstAccess(body.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Recuperação de senha — Esqueci minha senha (proteção total contra enumeração)
 */
authRouter.post('/api/v1/auth/forgot-password', async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await requestPasswordReset(body.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Redefinição de senha com token seguro de recuperação
 */
authRouter.post('/api/v1/auth/reset-password', async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await resetPasswordWithToken(body.token, body.password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Envio de código OTP para confirmação do celular
 */
authRouter.post('/api/v1/auth/otp/send', async (req, res, next) => {
  try {
    const body = sendOtpSchema.parse(req.body);
    const result = await sendPhoneOtp(body.phone, body.name);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Validação do código OTP informado
 */
authRouter.post('/api/v1/auth/otp/verify', (req, res, next) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    const result = verifyPhoneOtp(body.phone, body.code);
    if (!result.success) {
      res.status(400).json({ success: false, error: { message: result.message } });
      return;
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Ações Administrativas de Acesso e Credenciais (/admin)
 */
authRouter.post('/api/v1/admin/clients/resend-activation', async (req, res, next) => {
  try {
    const body = adminActionSchema.parse(req.body);
    const actor = req.header('x-actor-name') || 'Administrador Marthi';
    const result = await adminResendActivationLink(
      body.email,
      body.clientName || 'Cliente',
      body.planName || 'Plano Marthi',
      actor,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/admin/clients/force-reset', async (req, res, next) => {
  try {
    const body = adminActionSchema.parse(req.body);
    const actor = req.header('x-actor-name') || 'Administrador Marthi';
    const result = await adminForcePasswordReset(body.email, body.clientName || 'Cliente', actor);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/api/v1/admin/clients/toggle-access', async (req, res, next) => {
  try {
    const body = adminActionSchema.parse(req.body);
    const actor = req.header('x-actor-name') || 'Administrador Marthi';
    const active = body.active !== false;
    const result = await adminToggleUserAccess(body.email, active, actor);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/api/v1/admin/clients/security-status', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  const phone = typeof req.query.phone === 'string' ? req.query.phone : undefined;
  const status = getUserSecurityStatus(email, phone);
  res.json({ success: true, data: status });
});

authRouter.get('/api/v1/auth/me', async (req, res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token ausente.',
          details: {},
        },
      });
      return;
    }

    const user = await verifySessionToken(header.slice('Bearer '.length));
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
});

