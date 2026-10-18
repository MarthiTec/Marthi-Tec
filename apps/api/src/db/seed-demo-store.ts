/**
 * Explicit MarthiDB seed for the platform demo store.
 *
 * Usage (never runs on API boot):
 *   DATABASE_URL=... npm run db:seed-demo
 *
 * Idempotent: upserts ACC-MARTHI-DEMO + STR-DEMO-01 only.
 * Does not invent other clients (e.g. Cell Ponto) — those must already exist in DB.
 */
import { pool, dbConfigured, checkDatabaseConnection } from './pool.js';
import { runMigrations } from './migrate.js';

const DEMO_ACCOUNT_ID = 'ACC-MARTHI-DEMO';
const DEMO_STORE_ID = 'STR-DEMO-01';

async function seedDemoStore() {
  if (!dbConfigured) {
    throw new Error('Configure DATABASE_URL (ou DB_*) antes de rodar o seed.');
  }

  const health = await checkDatabaseConnection();
  if (!health.connected) {
    throw new Error(health.error || 'Não foi possível conectar ao MarthiDB.');
  }

  await runMigrations();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO client_accounts (
         id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token
       ) VALUES (
         $1, $2, $3, 'cnpj', $4, $5, $6, $7, 'active', $8
       )
       ON CONFLICT (id) DO UPDATE SET
         trade_name = EXCLUDED.trade_name,
         legal_name = EXCLUDED.legal_name,
         status = 'active',
         updated_at = now()`,
      [
        DEMO_ACCOUNT_ID,
        'Marthi Demonstração',
        'Marthi Tecnologia e Demonstração LTDA',
        '00.000.000/0001-91',
        'contato@marthi.com.br',
        '(11) 3000-0000',
        'Marthi Demo',
        'TK-ACC-DEMO-000191',
      ],
    );

    // is_demo column from migration 0053 (safe if already applied)
    await client.query(`UPDATE client_accounts SET is_demo = true WHERE id = $1`, [DEMO_ACCOUNT_ID]).catch(() => undefined);

    await client.query(
      `INSERT INTO stores (
         id, client_account_id, trade_name, legal_name, document_type, document,
         state_registration, municipal_registration, email, phone,
         zip_code, street, number, complement, district, city, state,
         tax_regime, is_matrix, active, access_token
       ) VALUES (
         $1, $2, $3, $4, 'cnpj', $5,
         'ISENTO', '12345', $6, $7,
         '01310-100', 'Avenida Paulista', '1000', 'Sala Demo', 'Bela Vista', 'São Paulo', 'SP',
         'simples_nacional', true, true, $8
       )
       ON CONFLICT (id) DO UPDATE SET
         trade_name = EXCLUDED.trade_name,
         active = true,
         client_account_id = EXCLUDED.client_account_id,
         updated_at = now()`,
      [
        DEMO_STORE_ID,
        DEMO_ACCOUNT_ID,
        'Loja Demonstração Marthi',
        'Marthi Tecnologia e Demonstração LTDA',
        '00.000.000/0001-91',
        'loja@marthi.com.br',
        '(11) 3000-0000',
        'TK-DEMO-000191-MDEM-01',
      ],
    );

    // Optional columns from later migrations
    await client
      .query(
        `UPDATE stores SET segment = COALESCE(segment, 'assistencia_tecnica'),
          stock_mode = COALESCE(stock_mode, 'simple')
         WHERE id = $1`,
        [DEMO_STORE_ID],
      )
      .catch(() => undefined);

    await client.query(
      `INSERT INTO store_licenses (
         id, store_id, client_account_id, plan_id, modules, base_price, discount_percent, final_price, status
       ) VALUES (
         $1, $2, $3, 'golden', ARRAY['totem','os','erp','fiscal']::TEXT[], 0, 0, 0, 'active'
       )
       ON CONFLICT (store_id) DO UPDATE SET
         status = 'active',
         plan_id = EXCLUDED.plan_id,
         modules = EXCLUDED.modules,
         updated_at = now()`,
      [`LIC-${DEMO_STORE_ID}`, DEMO_STORE_ID, DEMO_ACCOUNT_ID],
    );

    await client.query('COMMIT');
    console.log(`[seed-demo] OK account=${DEMO_ACCOUNT_ID} store=${DEMO_STORE_ID}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDemoStore().catch((error) => {
  console.error('[seed-demo] falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
