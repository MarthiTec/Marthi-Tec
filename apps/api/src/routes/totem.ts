import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
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
  storeName: 'Loja Principal',
  storeLogo: null,
  attractBackground: null,
  attractGradientColor: '#0f766e',
  attractLayout: 'standard',
  keyboardPlacement: 'bottom',
  askCustomerName: false,
  offerFulfillment: true,
  printTicket: false,
  audioAssist: false,
  storeWhatsApp: '',
  notifyCustomerOnLead: false,
  locationLabel: 'Loja Principal',
  cardFeePercent: 12.0,
};

const memoryTotemSettingsByStore = new Map<string, any>([
  ['STR-DEMO-01', { ...defaultTotemSettings, storeName: 'Loja Demonstração Marthi' }],
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
  storeName: z.string().default('Loja Principal'),
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
  const selected=req.header('x-store-id')?.trim() || (typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '');
  if (!selected) throw Object.assign(new Error('Informe a loja do totem.'), {status:400});
  const result=await pool.query('SELECT id FROM stores WHERE id=$1 AND active=true',[selected]);
  if (!result.rows.length) throw Object.assign(new Error('Loja não encontrada.'), {status:404});
  return selected;
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
      throw err;
    }
  }

  const memory = memoryTotemSettingsByStore.get(storeId) || memoryTotemSettingsByStore.get('STR-DEMO-01');
  return { ...defaultTotemSettings, ...(memory || {}) };
}

async function handleGetSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const settings = await getStoreTotemSettings(storeId);
    if (!req.user) { const {exitPassword, ...publicSettings}=settings; res.json({success:true,data:publicSettings}); return; }
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

async function handleGetCatalog(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);

    if (pool) {
      try {
        const sql = `
          SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
                 kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
                 attrs, color, capacity, card_rate, show_on_totem, images, created_at, updated_at
          FROM stock_items
          WHERE store_id = $1
            AND active = true
            AND (show_on_totem = true OR show_on_totem IS NULL)
          ORDER BY name ASC
        `;
        const result = await pool.query(sql, [storeId]);
        res.json({ success: true, data: result.rows.map(formatStockRow) });
        return;
      } catch (dbErr) {
        throw dbErr;
      }
    }

    const items = Array.from(memoryStock.values())
      .filter((i) => i.storeId === storeId && i.active !== false && i.showOnTotem !== false)
      .map(formatStockRow);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
}

async function handleGetAttributes(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);

    if (pool) {
      const attrsRes = await pool.query(
        `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active
         FROM product_attributes
         WHERE store_id = $1
           AND active = true
           AND use_on_totem = true
         ORDER BY sort ASC, name ASC`,
        [storeId],
      );

      if (attrsRes.rows.length > 0) {
        const items = [];
        for (const row of attrsRes.rows) {
          const valRes = await pool.query(
            `SELECT value, price_delta, sort FROM product_attribute_values WHERE attribute_id = $1 ORDER BY sort ASC, id ASC`,
            [row.id],
          );
          const values: string[] = [];
          const priceDeltas: Record<string, number> = {};
          for (const v of valRes.rows) {
            values.push(v.value);
            if (Number(v.price_delta) !== 0) {
              priceDeltas[v.value] = Number(v.price_delta);
            }
          }
          items.push({
            id: row.id,
            name: row.name,
            values,
            priceDeltas,
            useOnTotem: Boolean(row.use_on_totem),
            filterOnTotem: Boolean(row.filter_on_totem),
            useOnStock: Boolean(row.use_on_stock),
            sort: Number(row.sort) || 0,
            active: Boolean(row.active),
          });
        }
        res.json({ success: true, data: items });
        return;
      }
    }

    res.json({ success: true, data: [] });
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
totemRouter.get('/api/v1/store/totem-settings', requireOrDemoAuth, handleGetSettings);
totemRouter.get('/store/totem-settings', requireOrDemoAuth, handleGetSettings);
totemRouter.put('/api/v1/store/totem-settings', requireOrDemoAuth, handleSaveSettings);
totemRouter.put('/store/totem-settings', requireOrDemoAuth, handleSaveSettings);

// ── Rotas Públicas do Totem (cliente / terminal sem autenticação) ────────────
totemRouter.get('/api/v1/totem/settings', handleGetSettings);
totemRouter.get('/totem/settings', handleGetSettings);
totemRouter.put('/api/v1/totem/settings', requireAuth, handleSaveSettings);
totemRouter.put('/totem/settings', requireAuth, handleSaveSettings);

totemRouter.get('/api/v1/totem/catalog', handleGetCatalog);
totemRouter.get('/totem/catalog', handleGetCatalog);

totemRouter.get('/api/v1/totem/attributes', handleGetAttributes);
totemRouter.get('/totem/attributes', handleGetAttributes);

totemRouter.post('/api/v1/totem/leads', handleCreateLead);
totemRouter.post('/totem/leads', handleCreateLead);
