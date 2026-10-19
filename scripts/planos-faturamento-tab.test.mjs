import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('web nav exposes Planos & Faturamento in sidebar and top shortcuts', () => {
  const nav = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/adminNav.ts'), 'utf8');
  const shortcuts = fs.readFileSync(path.join(root, 'apps/web/src/data/screenDirectory.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'apps/web/src/App.tsx'), 'utf8');
  assert.match(nav, /Planos & Faturamento/);
  assert.match(nav, /\/painel\/plano/);
  assert.match(shortcuts, /Planos & Faturamento/);
  assert.match(app, /path="faturamento"/);
});

test('StoreBillingPanel renders QR / BR Code path', () => {
  const panel = fs.readFileSync(path.join(root, 'apps/web/src/components/StoreBillingPanel.tsx'), 'utf8');
  assert.match(panel, /qrDataUrl|QrCodeView/);
  assert.match(panel, /brCode/);
  assert.match(panel, /fetchStoreBillingSubscription/);
});

test('mobile billing screen and menu entry exist', () => {
  const screen = fs.readFileSync(path.join(root, 'apps/mobile/src/screens/billing/BillingScreen.tsx'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'apps/mobile/src/screens/MenuScreen.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'apps/mobile/app/(app)/billing.tsx'), 'utf8');
  assert.match(screen, /Planos & Faturamento/);
  assert.match(screen, /qrDataUrl/);
  assert.match(menu, /\/\(app\)\/billing/);
  assert.match(route, /BillingScreen/);
});

test('API pix service and migration seed official Marthi key', () => {
  const service = fs.readFileSync(path.join(root, 'apps/api/src/services/pixBrCode.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'apps/api/src/db/migrations/0112_platform_payout_pix_marthi.sql'),
    'utf8',
  );
  const env = fs.readFileSync(path.join(root, 'apps/api/src/config/env.ts'), 'utf8');
  assert.match(service, /marthi\.tecnologia@gmail\.com/);
  assert.match(service, /buildBillingPixPayload/);
  assert.match(migration, /marthi\.tecnologia@gmail\.com/);
  assert.match(env, /PLATFORM_PIX_KEY/);
});
