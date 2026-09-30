import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { formatStockRow, memoryStock } from './stock.js';

export const totemRouter = Router();

const defaultTotemSettings = {
  mode: 'kiosk',
  exitPassword: '1234',
  shareStockWithErp: true,
  vertical: 'phones',
  columns: 2,
  showAttractScreen: true,
  showActionButtons: true,
  customGreetingText: '',
  customSubtitleText: '',
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

const memoryTotemSettingsByStore = new Map<string, any>([
  ['STR-DEMO-01', { ...defaultTotemSettings }],
]);

const totemSettingsSchema = z.object({
  mode: z.enum(['kiosk', 'catalog']).default('kiosk'),
  exitPassword: z.string().optional(),
  shareStockWithErp: z.boolean().default(true),
  vertical: z.enum(['general', 'food', 'retail', 'phones', 'optics']).default('phones'),
  columns: z.coerce.number().min(1).max(4).default(2),
  showAttractScreen: z.boolean().default(true),
  showActionButtons: z.boolean().default(true),
  customGreetingText: z.string().optional().default(''),
  customSubtitleText: z.string().optional().default(''),
  storeName: z.string().default('Cell Ponto'),
  storeLogo: z.string().nullable().optional(),
  attractBackground: z.string().nullable().optional(),
  attractGradientColor: z.string().default('#0f766e'),
  attractLayout: z.enum(['standard', 'logoPromo']).default('standard'),
  keyboardPlacement: z.enum(['top', 'bottom']).default('bottom'),
  askCustomerName: z.boolean().default(false),
  offerFulfillment: z.boolean().default(true),
  printTicket: z.boolean().default(false),
  audioAssist: z.boolean().default(false),
  storeWhatsApp: z.string().optional().default(''),
  notifyCustomerOnLead: z.boolean().default(false),
  locationLabel: z.string().optional().default(''),
  cardFeePercent: z.coerce.number().default(0),
});

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

async function resolveStoreId(req: Request): Promise<string> {
  if (req.storeId) return req.storeId;
  const headerStoreId = req.header('x-store-id')?.trim();
  if (headerStoreId) return headerStoreId;
  const queryStoreId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
  if (queryStoreId) return queryStoreId;

  if (pool) {
    try {
      const q = await pool.query(
        `SELECT id FROM stores WHERE is_matrix = true AND active = true ORDER BY created_at ASC LIMIT 1`,
      );
      if (q.rows.length > 0 && q.rows[0].id) {
        return q.rows[0].id;
      }
    } catch {
      // ignore
    }
  }

  return 'STR-DEMO-01';
}

async function getStoreTotemSettings(storeId: string) {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, trade_name, totem_exit_password, totem_settings FROM stores WHERE id = $1`,
        [storeId],
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        const rawSettings = typeof row.totem_settings === 'string' 
          ? JSON.parse(row.totem_settings) 
          : (row.totem_settings || {});
        
        return {
          ...defaultTotemSettings,
          ...rawSettings,
          storeName: rawSettings.storeName || row.trade_name || defaultTotemSettings.storeName,
          exitPassword: row.totem_exit_password || rawSettings.exitPassword || defaultTotemSettings.exitPassword,
        };
      }
    } catch (err) {
      console.warn('[totem] Falha ao ler totem_settings do banco:', err);
    }
  }

  const memory = memoryTotemSettingsByStore.get(storeId) || memoryTotemSettingsByStore.get('STR-DEMO-01');
  return { ...defaultTotemSettings, ...(memory || {}) };
}

async function handleGetSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const settings = await getStoreTotemSettings(storeId);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

async function handleSaveSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const parsed = totemSettingsSchema.partial().parse(req.body);

    const current = await getStoreTotemSettings(storeId);
    const nextExitPassword = (parsed.exitPassword !== undefined && parsed.exitPassword.trim() !== '')
      ? parsed.exitPassword.trim()
      : current.exitPassword;

    const merged = {
      ...current,
      ...parsed,
      exitPassword: nextExitPassword,
    };

    if (pool) {
      try {
        await pool.query(
          `UPDATE stores 
           SET totem_exit_password = $1,
               totem_settings = $2::jsonb,
               updated_at = now()
           WHERE id = $3`,
          [nextExitPassword, JSON.stringify(merged), storeId],
        );
      } catch (err) {
        console.error('[totem] Erro ao gravar totem_settings no Postgres:', err);
      }
    }

    memoryTotemSettingsByStore.set(storeId, merged);
    res.json({ success: true, data: merged });
  } catch (error) {
    next(error);
  }
}

async function handleGetCatalog(_req: Request, res: Response, next: NextFunction) {
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

async function handleGetAttributes(_req: Request, res: Response, next: NextFunction) {
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

async function handleCreateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = leadSchema.parse(req.body);
    const storeId = await resolveStoreId(req);
    const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const code = Math.floor(100 + Math.random() * 900);

    const desc = `${body.productName} · ${body.color || ''} ${body.storage || ''} ${body.fulfillment || ''}`.trim();

    if (pool) {
      await pool.query(
        `INSERT INTO pos_tickets (id, store_id, code, customer_name, customer_phone, status, source, notes)
         VALUES ($1, $2, $3, $4, $5, 'open', 'totem', $6)`,
        [ticketId, storeId, code, body.customerName, body.customerPhone, `${desc}\n${body.notes}`.trim()],
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

// ── Rotas do Totem e Configurações da Empresa (/store/totem-settings) ────────
totemRouter.get('/api/v1/store/totem-settings', requireAuth, handleGetSettings);
totemRouter.get('/store/totem-settings', requireAuth, handleGetSettings);
totemRouter.put('/api/v1/store/totem-settings', requireAuth, handleSaveSettings);
totemRouter.put('/store/totem-settings', requireAuth, handleSaveSettings);

// ── Rotas Públicas do Totem (cliente / terminal sem autenticação) ────────────
totemRouter.get('/api/v1/totem/settings', handleGetSettings);
totemRouter.get('/totem/settings', handleGetSettings);
totemRouter.put('/api/v1/totem/settings', handleSaveSettings);
totemRouter.put('/totem/settings', handleSaveSettings);

totemRouter.get('/api/v1/totem/catalog', handleGetCatalog);
totemRouter.get('/totem/catalog', handleGetCatalog);

totemRouter.get('/api/v1/totem/attributes', handleGetAttributes);
totemRouter.get('/totem/attributes', handleGetAttributes);

totemRouter.post('/api/v1/totem/leads', handleCreateLead);
totemRouter.post('/totem/leads', handleCreateLead);
