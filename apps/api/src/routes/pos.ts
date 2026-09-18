import { Router } from 'express';
import { z } from 'zod';

export type PosTicketStatus = 'open' | 'sold' | 'cancelled';

export type PosTicket = {
  id: string;
  source: 'totem' | 'manual';
  status: PosTicketStatus;
  customerName: string;
  customerPhone: string;
  productName: string;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
  createdAt: string;
  closedAt: string | null;
};

const tickets: PosTicket[] = [];

export function createPosTicket(
  input: Omit<PosTicket, 'id' | 'status' | 'createdAt' | 'closedAt'> & {
    status?: PosTicketStatus;
  },
): PosTicket {
  const ticket: PosTicket = {
    ...input,
    id: `PDV-${Date.now().toString(36).toUpperCase()}`,
    status: input.status ?? 'open',
    createdAt: new Date().toISOString(),
    closedAt: null,
  };
  tickets.unshift(ticket);
  if (tickets.length > 300) tickets.pop();
  return ticket;
}

const statusSchema = z.object({
  status: z.enum(['open', 'sold', 'cancelled']),
});

export const posRouter = Router();

posRouter.get('/api/v1/pos/tickets', (_req, res) => {
  res.json({
    success: true,
    data: {
      open: tickets.filter((item) => item.status === 'open').length,
      items: tickets,
    },
  });
});

posRouter.patch('/api/v1/pos/tickets/:id', (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Status inválido.',
      },
    });
    return;
  }

  const ticket = tickets.find((item) => item.id === req.params.id);
  if (!ticket) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ticket de PDV não encontrado.' },
    });
    return;
  }

  ticket.status = parsed.data.status;
  ticket.closedAt = parsed.data.status === 'open' ? null : new Date().toISOString();

  res.json({ success: true, data: ticket });
});
