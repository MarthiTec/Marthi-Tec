import { Router } from 'express';
import { z } from 'zod';
import { createPosTicket } from './pos.js';
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
    const ticket = createPosTicket({
      source: 'totem',
      customerName: lead.customerName,
      customerPhone: lead.customerPhone,
      productName: lead.productName,
      color: lead.color,
      storage: lead.storage,
      fulfillment: lead.fulfillment,
      payment: lead.payment,
      installment: lead.installment ?? null,
      priceLabel: lead.priceLabel,
    });

    let customerNotified = false;
    try {
      const result = await submitTotemLead({
        ...lead,
        installment: lead.installment ?? null,
      });
      customerNotified = result.customerNotified;
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: number }).status)
          : 500;
      if (status !== 501) {
        throw error;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        message: customerNotified
          ? 'Lead enviado via Evolution WhatsApp e aberto no PDV.'
          : 'Pedido aberto no PDV. WhatsApp ainda não configurado.',
        customerNotified,
        ticketId: ticket.id,
      },
    });
  } catch (error) {
    next(error);
  }
});
