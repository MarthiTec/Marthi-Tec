import { Router } from 'express';
import { z } from 'zod';

/**
 * Cadastro público de parceiro (homepage).
 * Persistência em banco fica com o Thiago — por enquanto aceita e devolve protocolo.
 */
export const partnersRouter = Router();

const signupSchema = z
  .object({
    planId: z.enum(['start', 'growth', 'scale']),
    modules: z
      .array(z.enum(['totem', 'presales', 'os', 'erp']))
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

    if (data.planId === 'start' && data.modules.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules'],
        message: 'Plano Start: exatamente 1 módulo.',
      });
    }

    if (data.planId === 'growth' && (data.modules.length < 1 || data.modules.length > 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules'],
        message: 'Plano Growth: no máximo 2 módulos.',
      });
    }

    if (data.planId === 'scale') {
      const required = ['totem', 'presales', 'os', 'erp'];
      const missing = required.filter((item) => !data.modules.includes(item as typeof data.modules[number]));
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['modules'],
          message: 'Plano Scale: todos os módulos devem estar liberados.',
        });
      }
    }
  });

const pendingSignups: Array<z.infer<typeof signupSchema> & { id: string; createdAt: string }> = [];

partnersRouter.post('/api/v1/partners/signup', (req, res) => {
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

  console.log('[partners] signup', {
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
      message: 'Cadastro recebido. A equipe Marthi entrará em contato.',
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
