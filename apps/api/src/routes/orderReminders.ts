import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireCommunicationAdmin } from '../services/storeCommunication.js';
import { readReminderSettings, saveReminderSettings } from '../services/orderReminders.js';

/** Configuração e registro dos lembretes de chegada da encomenda (WhatsApp para o cliente e a loja). */
export const orderRemindersRouter = Router();

orderRemindersRouter.get('/api/v1/order-reminders/settings', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, data: await readReminderSettings(req.storeId!) });
  } catch (error) {
    next(error);
  }
});

orderRemindersRouter.put('/api/v1/order-reminders/settings', requireAuth, requireCommunicationAdmin, async (req, res, next) => {
  try {
    res.json({ success: true, data: await saveReminderSettings(req.storeId!, req.body) });
  } catch (error) {
    next(error);
  }
});

orderRemindersRouter.get('/api/v1/order-reminders', requireAuth, async (req, res, next) => {
  try {
    const rows = (
      await pool.query(
        `SELECT id, source, ref_id, reminder_date::text AS reminder_date, customer_name, customer_phone, product_name, customer_status, store_status, error, sent_at
           FROM order_reminders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.storeId],
      )
    ).rows;
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        source: row.source,
        refId: row.ref_id,
        date: row.reminder_date,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        productName: row.product_name,
        customerStatus: row.customer_status,
        storeStatus: row.store_status,
        error: row.error,
        sentAt: row.sent_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});
