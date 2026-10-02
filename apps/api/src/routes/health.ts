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

    // 1. Apagar com segurança todas as tabelas dependentes das lojas e contas de teste
    await client.query(`
      DO $$ BEGIN
        BEGIN DELETE FROM cash_movements WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM cash_session_events WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM cash_sessions WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales_orders WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM sales_order_lines WHERE sale_id IN (SELECT id FROM sales_orders WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM sales_orders WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM pos_quote_lines WHERE quote_id IN (SELECT id FROM pos_quotes WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM pos_quotes WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM pos_ticket_attributes WHERE ticket_id IN (SELECT id FROM pos_tickets WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM pos_tickets WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM pos_terminals WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM stock_invoice_lines WHERE invoice_id IN (SELECT id FROM stock_invoices WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM stock_invoices WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM stock_inventory_items WHERE inventory_id IN (SELECT id FROM stock_inventories WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM stock_inventories WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM stock_movements WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM payables WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM receivables WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM finance_entries WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_attribute_values WHERE attribute_id IN (SELECT id FROM product_attributes WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_allowed_values WHERE attribute_id IN (SELECT id FROM product_attributes WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_attributes WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_kit_items WHERE kit_id IN (SELECT id FROM product_kits WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_kits WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM product_lots WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM promo_campaign_tiers WHERE campaign_id IN (SELECT id FROM promo_campaigns WHERE store_id != 'STR-DEMO-01'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM promo_campaigns WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM price_tables WHERE store_id != 'STR-DEMO-01'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM auth_tokens WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM partner_signups WHERE email LIKE '%@marthi.teste' OR email LIKE '%teste@%' OR company_name LIKE '%Alpha%' OR company_name LIKE '%Beta%' OR id LIKE 'PRT-MURC%'; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN DELETE FROM users WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%'; EXCEPTION WHEN OTHERS THEN NULL; END;
      END $$;
    `);

    // 3. Garantir conta ACC-MARTHI-DEMO com plano Gold, status ativo e dados neutros de demonstração
    await client.query(`
      UPDATE client_accounts
      SET trade_name = 'Marthi Demonstração',
          legal_name = 'Marthi Tecnologia e Demonstração LTDA',
          document = '00.000.000/0001-91',
          email = 'teste@marthi.com.br',
          phone = '(11) 3000-0000',
          contact_name = 'Administrador Marthi',
          status = 'active',
          access_token = 'TK-DEMO-000191-MDEM-01'
      WHERE id = 'ACC-MARTHI-DEMO';

      UPDATE stores
      SET trade_name = 'Loja Demonstração Marthi',
          legal_name = 'Marthi Tecnologia e Demonstração LTDA',
          document = '00.000.000/0001-91',
          email = 'loja@marthi.com.br',
          phone = '(11) 3000-0000',
          zip_code = '01310-100',
          street = 'Avenida Paulista',
          number = '1000',
          complement = 'Sala Demo',
          district = 'Bela Vista',
          city = 'São Paulo',
          state = 'SP',
          is_matrix = true,
          active = true,
          access_token = 'TK-DEMO-000191-MDEM-01'
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
