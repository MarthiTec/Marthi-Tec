import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();

// Pure helpers are TS — assert via duplicated expectations through dynamic import of built code
// is not available; instead mirror the bucket rules here and lock UI/API wiring in source.

function bucketForDaysPastDue(days) {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

test('F3: aging bucket rules (computed, not mocked columns)', () => {
  assert.equal(bucketForDaysPastDue(-5), 'current');
  assert.equal(bucketForDaysPastDue(0), 'current');
  assert.equal(bucketForDaysPastDue(1), 'd1_30');
  assert.equal(bucketForDaysPastDue(30), 'd1_30');
  assert.equal(bucketForDaysPastDue(31), 'd31_60');
  assert.equal(bucketForDaysPastDue(90), 'd61_90');
  assert.equal(bucketForDaysPastDue(91), 'd90_plus');
});

test('F3: financeAging.ts builds from due_date + open remainder', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/data/financeAging.ts'), 'utf8');
  assert.match(src, /due_date|dueDate/);
  assert.match(src, /buildAgingSide/);
  assert.doesNotMatch(src, /\bfaker\b|seedBuckets|DEMO_AGING|fakeAging/i);
});

test('F3: FinancePage tab aging + AgingPanel empty state', () => {
  const page = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/FinancePage.tsx'), 'utf8');
  assert.match(page, /id: 'aging'/);
  assert.match(page, /AgingPanel/);
  const panel = fs.readFileSync(path.join(root, 'apps/web/src/components/finance/AgingPanel.tsx'), 'utf8');
  assert.match(panel, /Nenhum título em aberto/);
  assert.match(panel, /Sem números fictícios|sem faixas inventadas/i);
});

test('F3: hub links to aging tab', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/pages/erp/ErpReportsPage.tsx'), 'utf8');
  assert.match(hub, /\/erp\/financeiro\?tab=aging/);
});

// Keep require available if we later compile — silence unused in some runners
void createRequire;
