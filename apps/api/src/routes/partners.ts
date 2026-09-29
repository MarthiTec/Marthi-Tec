import { Router } from 'express';
import { z } from 'zod';
import { registerClientUser } from '../services/authService.js';

/**
 * Cadastro público de parceiro e contratação comercial.
 */
export const partnersRouter = Router();

const signupSchema = z
  .object({
    planId: z.enum(['bronze', 'silver', 'golden', 'start', 'growth', 'scale']),
    modules: z
      .array(z.enum(['totem', 'presales', 'os', 'erp', 'fiscal', 'ecommerce', 'pdv']))
      .min(1, 'Selecione ao menos um módulo.'),
    documentType: z.enum(['cnpj', 'cpf']),
    document: z.string().min(11).max(18),
    legalName: z.string().min(2).max(180),
    tradeName: z.string().min(2).max(180),
    email: z.string().email(),
    phone: z.string().min(8).max(20),
    zipCode: z.string().min(8).max(9),
    street: z.string().min(2).max(180),
    number: z.string().min(1).max(20),
    complement: z.string().max(120).optional().default(''),
    district: z.string().min(2).max(120),
    city: z.string().min(2).max(120),
    state: z.string().length(2),
    segment: z.string().max(80).optional().default(''),
    contactName: z.string().min(2).max(120),
    contactRole: z.string().max(80).optional().default(''),
    notes: z.string().max(1000).optional().default(''),
    password: z.string().min(4).optional(),
  })
  .superRefine((data, ctx) => {
    const unique = new Set(data.modules);
    if (unique.size !== data.modules.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules'],
        message: 'Módulos duplicados não são permitidos.',
      });
    }
  });

const pendingSignups: Array<z.infer<typeof signupSchema> & { id: string; createdAt: string }> = [];

partnersRouter.post('/api/v1/partners/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos no cadastro de parceiro.',
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const id = `PRT-${Date.now().toString(36).toUpperCase()}`;
  const record = {
    ...parsed.data,
    id,
    createdAt: new Date().toISOString(),
  };
  pendingSignups.unshift(record);
  if (pendingSignups.length > 200) pendingSignups.pop();

  // Create initial user credentials so they exist in system
  try {
    const initialPassword = parsed.data.password || parsed.data.document.replace(/\D/g, '').slice(0, 6) || 'marthi123';
    await registerClientUser({
      email: parsed.data.email,
      password: initialPassword,
      name: parsed.data.contactName || parsed.data.tradeName,
      tradeName: parsed.data.tradeName,
      clientAccountId: id,
      role: 'admin',
    });
  } catch (err) {
    console.warn('[partners] could not pre-register user account:', err);
  }

  console.log('[partners] signup created', {
    id,
    planId: record.planId,
    modules: record.modules,
    tradeName: record.tradeName,
    documentType: record.documentType,
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      message: 'Cadastro recebido com sucesso. Conta preparada para ativação.',
    },
  });
});

partnersRouter.get('/api/v1/partners/signup/pending', (_req, res) => {
  res.json({
    success: true,
    data: {
      count: pendingSignups.length,
      items: pendingSignups.slice(0, 50).map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        planId: item.planId,
        modules: item.modules,
        tradeName: item.tradeName,
        legalName: item.legalName,
        email: item.email,
        city: item.city,
        state: item.state,
      })),
    },
  });
});
