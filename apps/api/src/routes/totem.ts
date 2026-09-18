import { Router } from 'express';
import { z } from 'zod';
import { submitTotemLead } from '../services/evolutionWhatsApp.js';

export const totemRouter = Router();

const leadSchema = z.object({
  customerName: z.string().trim().min(2),
  customerPhone: z.string().trim().min(8),
  productName: z.string().trim().min(1),
  color: z.string().trim().min(1),
  storage: z.string().trim().min(1),
  fulfillment: z.string().trim().min(1),
  payment: z.string().trim().min(1),
  installment: z.string().trim().nullable().optional(),
  priceLabel: z.string().trim().min(1),
});

totemRouter.post('/api/v1/totem/leads', async (req, res, next) => {
  try {
    const lead = leadSchema.parse(req.body);
    const result = await submitTotemLead({
      ...lead,
      installment: lead.installment ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        message: 'Lead enviado via Evolution WhatsApp.',
        customerNotified: result.customerNotified,
      },
    });
  } catch (error) {
    next(error);
  }
});
