import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('migration 0116 adds module/menu/action_type to audit_logs', () => {
  const sql = fs.readFileSync(
    path.join(root, 'apps/api/src/db/migrations/0116_audit_logs_operacoes.sql'),
    'utf8',
  );
  assert.match(sql, /ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module/);
  assert.match(sql, /menu_label/);
  assert.match(sql, /action_type/);
  assert.match(sql, /inclusao.*alteracao.*exclusao.*conclusao/s);
});

test('auditLogWriter service exists with writeAuditLogSafe', () => {
  const src = fs.readFileSync(path.join(root, 'apps/api/src/services/auditLogWriter.ts'), 'utf8');
  assert.match(src, /export async function writeAuditLog/);
  assert.match(src, /export async function writeAuditLogSafe/);
  assert.match(src, /AUDIT_MODULE_LABELS/);
  assert.match(src, /inclusao/);
});

test('high-traffic routes wire writeAuditLogSafe', () => {
  const files = [
    'apps/api/src/routes/stock.ts',
    'apps/api/src/routes/stockEntries.ts',
    'apps/api/src/routes/sales.ts',
    'apps/api/src/routes/pos.ts',
    'apps/api/src/routes/registry.ts',
    'apps/api/src/routes/finance.ts',
    'apps/api/src/routes/salesCatalogs.ts',
    'apps/api/src/routes/workOrders.ts',
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /writeAuditLogSafe/, `${file} should call writeAuditLogSafe`);
  }
});

test('AuditPage filters by module and action type with AdminPicker', () => {
  const page = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/AuditPage.tsx'), 'utf8');
  assert.match(page, /AdminPicker/);
  assert.match(page, /AUDIT_MODULE_FILTERS/);
  assert.match(page, /AUDIT_ACTION_TYPE_FILTERS/);
  assert.match(page, /apiListStoreAudit/);
  assert.doesNotMatch(page, /<select/);
});

test('front hydrates MarthiDB audit-logs and dual-writes', () => {
  const log = fs.readFileSync(path.join(root, 'apps/web/src/data/auditLog.ts'), 'utf8');
  assert.match(log, /apiListStoreAudit/);
  assert.match(log, /apiCreateStoreAudit/);
  const api = fs.readFileSync(path.join(root, 'apps/web/src/services/erpApi.ts'), 'utf8');
  assert.match(api, /\/audit-logs/);
});

test('copy-api-migrations still picks up *.sql including 0116', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/copy-api-migrations.mjs'), 'utf8');
  assert.match(script, /apps.*api.*src.*db.*migrations/);
  assert.match(script, /\.sql/);
  const mig = path.join(root, 'apps/api/src/db/migrations/0116_audit_logs_operacoes.sql');
  assert.ok(fs.existsSync(mig));
});
