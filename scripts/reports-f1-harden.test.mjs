import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('F1: sales-goals report and export use completed status', () => {
  const reports = fs.readFileSync(path.join(root, 'apps/api/src/routes/reports.ts'), 'utf8');
  assert.match(reports, /s\.status = 'completed'/);
  assert.doesNotMatch(reports, /status != 'cancelled'/);
});

test('F1: Excel export uses nestDownload (Bearer), not window.open', () => {
  const page = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/SalesGoalsReportPage.tsx'), 'utf8');
  assert.match(page, /apiExportSalesGoalsReport/);
  assert.doesNotMatch(page, /window\.open\(/);
  const api = fs.readFileSync(path.join(root, 'apps/web/src/services/erpApi.ts'), 'utf8');
  assert.match(api, /apiExportSalesGoalsReport/);
  assert.match(api, /nestDownload\(`\/reports\/sales-goals\/export/);
});

test('F1: hub lists Vendas, DRE, Peças and Painel nav has Relatórios', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/pages/erp/ErpReportsPage.tsx'), 'utf8');
  assert.match(hub, /\/painel\/relatorio-vendas/);
  assert.match(hub, /\/erp\/financeiro\?tab=dre/);
  assert.match(hub, /\/painel\/os\/pecas\?aba=relatorio/);
  const nav = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/adminNav.ts'), 'utf8');
  const erp = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  assert.match(erp, /to: '\/erp\/relatorios'/);
  assert.match(erp, /label: 'Relatórios'/);
});
