import { Router } from 'express';
import { z } from 'zod';
import {
  activateStoredClientUser,
  loginWithGoogleIdToken,
  loginWithPassword,
  registerClientUser,
  verifySessionToken,
} from '../services/authService.js';
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
