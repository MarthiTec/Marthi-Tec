import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { formatStockRow, memoryStock } from './stock.js';

export const totemRouter = Router();

const defaultTotemSettings = {
  mode: 'kiosk',
  exitPassword: '',
  shareStockWithErp: true,
  vertical: 'phones',
  columns: 2,
  showAttractScreen: true,
  storeName: 'Cell Ponto',
  storeLogo: null,
  attractBackground: null,
  attractGradientColor: '#0f766e',
  attractLayout: 'standard',
  keyboardPlacement: 'bottom',
  askCustomerName: false,
  offerFulfillment: true,
  printTicket: false,
  audioAssist: false,
  storeWhatsApp: '5524981244253',
  notifyCustomerOnLead: false,
  locationLabel: 'Cell Ponto Três Rios',
  cardFeePercent: 12.0,
};

const leadSchema = z.object({
  customerName: z.string().default('Cliente Totem'),
  customerPhone: z.string().default(''),
  productName: z.string().default('Produto'),
  attributes: z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })).optional(),
  color: z.string().optional().default(''),
  storage: z.string().optional().default(''),
  fulfillment: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

async function handleGetCatalog(_req: any, res: any, next: any) {
  try {
    if (pool) {
      const sql = `
        SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
               kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
               attrs, color, capacity, card_rate, show_on_totem, images, created_at, updated_at
        FROM stock_items
        WHERE active = true AND (show_on_totem = true OR show_on_totem IS NULL)
        ORDER BY name ASC
      `;
      const result = await pool.query(sql);
      res.json({ success: true, data: result.rows.map(formatStockRow) });
      return;
    }

    const items = Array.from(memoryStock.values())
      .filter((i) => i.active !== false && i.showOnTotem !== false)
      .map(formatStockRow);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
}

function handleGetSettings(_req: any, res: any) {
  res.json({ success: true, data: defaultTotemSettings });
}

async function handleGetAttributes(_req: any, res: any, next: any) {
  try {
    if (pool) {
      const resQuery = await pool.query(
        'SELECT * FROM product_attributes WHERE active = true ORDER BY name ASC',
      );
      if (resQuery.rows.length > 0) {
        res.json({ success: true, data: resQuery.rows });
        return;
      }
    }

    const fallbackAttrs = [
      { id: 'attr-cor', name: 'Cor', values: ['Preto', 'Branco', 'Azul', 'Desert', 'Titânio Natural'], active: true, useOnTotem: true, useOnStock: true },
      { id: 'attr-cap', name: 'Capacidade', values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], active: true, useOnTotem: true, useOnStock: true },
      { id: 'attr-ret', name: 'Retirada', values: ['Pronta Entrega', 'Sob Encomenda'], active: true, useOnTotem: true, useOnStock: true },
    ];
    res.json({ success: true, data: fallbackAttrs });
  } catch (error) {
    next(error);
  }
}

async function handleCreateLead(req: any, res: any, next: any) {
  try {
    const body = leadSchema.parse(req.body);
    const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const code = Math.floor(100 + Math.random() * 900);

    const desc = `${body.productName} · ${body.color || ''} ${body.storage || ''} ${body.fulfillment || ''}`.trim();

    if (pool) {
      await pool.query(
        `INSERT INTO pos_tickets (id, store_id, code, customer_name, customer_phone, status, source, notes)
         VALUES ($1, 'STR-DEMO-01', $2, $3, $4, 'open', 'totem', $5)`,
        [ticketId, code, body.customerName, body.customerPhone, `${desc}\n${body.notes}`.trim()],
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: ticketId,
        code,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        productName: body.productName,
        status: 'open',
        source: 'totem',
      },
    });
  } catch (error) {
    next(error);
  }
}

// Rotas com prefixo api/v1 e rotas diretas (compatibilidade total)
totemRouter.get('/api/v1/totem/catalog', handleGetCatalog);
totemRouter.get('/totem/catalog', handleGetCatalog);

totemRouter.get('/api/v1/totem/settings', handleGetSettings);
totemRouter.get('/totem/settings', handleGetSettings);

totemRouter.get('/api/v1/totem/attributes', handleGetAttributes);
totemRouter.get('/totem/attributes', handleGetAttributes);

totemRouter.post('/api/v1/totem/leads', handleCreateLead);
totemRouter.post('/totem/leads', handleCreateLead);
