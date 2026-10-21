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

test('F1+: Painel Relatórios menu + hub prefer /painel paths', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/pages/erp/ErpReportsPage.tsx'), 'utf8');
  assert.match(hub, /reportsHubSegments/);
  assert.match(hub, /\/painel\/relatorio-vendas/);
  assert.match(hub, /\/painel\/os\/pecas\?aba=relatorio/);

  const catalog = fs.readFileSync(path.join(root, 'apps/web/src/data/reportsHub.ts'), 'utf8');
  assert.match(catalog, /Financeiro & Lucros/);
  assert.match(catalog, /pos_quotes/);
  assert.match(catalog, /\/painel\/solicitacoes-compra/);

  const nav = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/adminNav.ts'), 'utf8');
  assert.match(nav, /id: 'relatorios'/);
  const reports = nav.slice(nav.indexOf("id: 'relatorios'"), nav.indexOf("id: 'ads'"));
  assert.match(reports, /to: '\/painel\/relatorios'/);
  assert.match(reports, /to: '\/painel\/relatorio-vendas'/);
  assert.match(reports, /to: '\/painel\/relatorio-estoque'/);
  assert.match(reports, /to: '\/painel\/relatorio-imei'/);
  assert.match(reports, /to: '\/painel\/financeiro\?tab=dre'/);
  // Não forçar Abrir Retaguarda para descobrir relatórios.
  assert.doesNotMatch(reports, /to: '\/erp\/relatorios'/);

  const erp = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'relatorios'"));
  assert.doesNotMatch(erp, /label: 'Relatórios'/);

  const app = fs.readFileSync(path.join(root, 'apps/web/src/App.tsx'), 'utf8');
  assert.match(app, /path="relatorios" element=\{<ErpReportsPage \/>\}/);
  assert.match(app, /path="relatorio-estoque" element=\{<StockReportPage \/>\}/);
  assert.match(app, /path="relatorio-imei" element=\{<ImeiReportPage \/>\}/);
  // Painel financeiro nativo (AdminLayout), não redirect obrigatório para /erp.
  const painelBlock = app.slice(app.indexOf('path="/painel"'), app.indexOf('</Route>\n      </Routes>'));
  assert.match(painelBlock, /path="financeiro" element=\{<FinancePage \/>\}/);
});
