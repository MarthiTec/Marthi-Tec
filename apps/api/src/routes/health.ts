import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseConnection, pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { verifySmtpConfig } from '../services/emailService.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const database = await checkDatabaseConnection();

  res.status(database.configured && !database.connected ? 503 : 200).json({
    success: database.connected || !database.configured,
    data: {
      service: env.APP_NAME,
      status: database.connected || !database.configured ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      database,
    },
  });
});

/**
 * Endpoint de diagnóstico para validar conexão SMTP e opcionalmente disparar teste
 * GET /health/email?email=matheusmarcal.mma@gmail.com
 * POST /api/v1/health/email
 */
healthRouter.get('/health/email', async (req, res) => {
  const target = typeof req.query.email === 'string' && req.query.email.trim()
    ? req.query.email.trim()
    : undefined;
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.get('/api/v1/health/email', async (req, res) => {
  const target = typeof req.query.email === 'string' && req.query.email.trim()
    ? req.query.email.trim()
    : undefined;
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.post('/api/v1/health/email', async (req, res) => {
  const target = typeof req.body?.email === 'string' && req.body.email.trim()
    ? req.body.email.trim()
    : 'matheusmarcal.mma@gmail.com';
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.get('/health/db-status', async (_req, res) => {
  if (!pool) {
    res.json({ success: false, error: 'Sem pool de conexão ativa.' });
    return;
  }
  try {
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC`,
    );
    let migrationsRes: any = { rows: [] };
    try {
      migrationsRes = await pool.query(`SELECT id, name, applied_at FROM _migrations ORDER BY id ASC`);
    } catch {
      // ignore
    }
    res.json({
      success: true,
      tables: tablesRes.rows.map((r: any) => r.table_name),
      migrations: migrationsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

healthRouter.all(['/health/migrate', '/api/v1/health/migrate'], async (_req, res) => {
  try {
    const applied = await runMigrations();
    res.json({ success: true, applied });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

healthRouter.all(['/health/cleanup-tests', '/api/v1/health/cleanup-tests'], async (_req, res) => {
  if (!pool) {
    res.status(500).json({ success: false, error: 'Sem pool' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Apagar tabelas dependentes das lojas de teste (qualquer loja diferente de STR-DEMO-01)
    await client.query(`
      DELETE FROM cash_movements WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id != 'STR-DEMO-01');
      DELETE FROM cash_session_events WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id != 'STR-DEMO-01');
      DELETE FROM cash_sessions WHERE store_id != 'STR-DEMO-01';
      DELETE FROM sale_payments WHERE order_id IN (SELECT id FROM sales_orders WHERE store_id != 'STR-DEMO-01');
      DELETE FROM sales_order_lines WHERE order_id IN (SELECT id FROM sales_orders WHERE store_id != 'STR-DEMO-01');
      DELETE FROM sales_orders WHERE store_id != 'STR-DEMO-01';
      DELETE FROM pos_quote_lines WHERE quote_id IN (SELECT id FROM pos_quotes WHERE store_id != 'STR-DEMO-01');
      DELETE FROM pos_quotes WHERE store_id != 'STR-DEMO-01';
      DELETE FROM pos_ticket_attributes WHERE ticket_id IN (SELECT id FROM pos_tickets WHERE store_id != 'STR-DEMO-01');
      DELETE FROM pos_tickets WHERE store_id != 'STR-DEMO-01';
      DELETE FROM pos_terminals WHERE store_id != 'STR-DEMO-01';
      DELETE FROM stock_invoice_lines WHERE invoice_id IN (SELECT id FROM stock_invoices WHERE store_id != 'STR-DEMO-01');
      DELETE FROM stock_invoices WHERE store_id != 'STR-DEMO-01';
      DELETE FROM stock_inventory_items WHERE inventory_id IN (SELECT id FROM stock_inventories WHERE store_id != 'STR-DEMO-01');
      DELETE FROM stock_inventories WHERE store_id != 'STR-DEMO-01';
      DELETE FROM stock_movements WHERE store_id != 'STR-DEMO-01';
      DELETE FROM payables WHERE store_id != 'STR-DEMO-01';
      DELETE FROM receivables WHERE store_id != 'STR-DEMO-01';
      DELETE FROM finance_entries WHERE store_id != 'STR-DEMO-01';
      DELETE FROM product_attribute_values WHERE attribute_id IN (SELECT id FROM product_attributes WHERE store_id != 'STR-DEMO-01');
      DELETE FROM product_allowed_values WHERE attribute_id IN (SELECT id FROM product_attributes WHERE store_id != 'STR-DEMO-01');
      DELETE FROM product_attributes WHERE store_id != 'STR-DEMO-01';
      DELETE FROM product_kit_items WHERE kit_id IN (SELECT id FROM product_kits WHERE store_id != 'STR-DEMO-01');
      DELETE FROM product_kits WHERE store_id != 'STR-DEMO-01';
      DELETE FROM product_lots WHERE store_id != 'STR-DEMO-01';
      DELETE FROM promo_campaign_tiers WHERE campaign_id IN (SELECT id FROM promo_campaigns WHERE store_id != 'STR-DEMO-01');
      DELETE FROM promo_campaigns WHERE store_id != 'STR-DEMO-01';
      DELETE FROM price_tables WHERE store_id != 'STR-DEMO-01';
      DELETE FROM products WHERE store_id != 'STR-DEMO-01';
      DELETE FROM stock_items WHERE store_id != 'STR-DEMO-01';
      DELETE FROM customers WHERE store_id != 'STR-DEMO-01';
      DELETE FROM sellers WHERE store_id != 'STR-DEMO-01';
      DELETE FROM employees WHERE store_id != 'STR-DEMO-01' OR user_email LIKE '%@marthi.teste' OR user_email LIKE 'admin.alpha%' OR user_email LIKE 'admin.beta%';
      DELETE FROM user_stores WHERE store_id != 'STR-DEMO-01';
      DELETE FROM store_licenses WHERE store_id != 'STR-DEMO-01' OR client_account_id != 'ACC-MARTHI-DEMO';
      DELETE FROM stores WHERE id != 'STR-DEMO-01';
    `);

    // 2. Apagar tokens de autenticação de teste e signups
    await client.query(`
      DELETE FROM auth_tokens WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
      DELETE FROM partner_signups WHERE email LIKE '%@marthi.teste' OR email LIKE '%teste@%' OR company_name LIKE '%Alpha%' OR company_name LIKE '%Beta%' OR id LIKE 'PRT-MURC%';
      DELETE FROM users WHERE client_account_id != 'ACC-MARTHI-DEMO' OR email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
      DELETE FROM client_accounts WHERE id != 'ACC-MARTHI-DEMO';
    `);

    // 3. Garantir conta ACC-MARTHI-DEMO com plano Gold e status ativo
    await client.query(`
      UPDATE client_accounts
      SET trade_name = 'Marthi Demonstração',
          legal_name = 'Marthi Tecnologia e Demonstração LTDA',
          document = '61.506.270/0001-63',
          email = 'teste@marthi.com.br',
          phone = '(24) 98124-4253',
          contact_name = 'Administrador Marthi',
          status = 'active',
          plan = 'golden',
          access_token = 'TK-001-000163-CPTR-88A1'
      WHERE id = 'ACC-MARTHI-DEMO';

      UPDATE stores
      SET trade_name = 'Loja Demonstração Marthi',
          legal_name = 'Marthi Tecnologia e Demonstração LTDA',
          document = '61.506.270/0001-63',
          email = 'loja@marthi.com.br',
          phone = '(24) 98124-4253',
          is_matrix = true,
          active = true,
          access_token = 'TK-001-000163-CPTR-88A1'
      WHERE id = 'STR-DEMO-01';

      INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
      VALUES ('LIC-DEMO-01', 'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'scale', ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[], 'active')
      ON CONFLICT (id) DO UPDATE SET
        plan_id = 'scale',
        status = 'active',
        modules = ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[];
    `);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Limpeza de dados de teste concluída com sucesso!' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  } finally {
    client.release();
  }
});
