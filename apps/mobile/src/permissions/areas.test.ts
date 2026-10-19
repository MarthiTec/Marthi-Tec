import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSeeFinance, canSeeOs, canSeeSales, canSeeStock, hasArea } from './areas';
import type { AccessContext } from '../api/types';

const base = (partial: Partial<AccessContext>): AccessContext => ({
  storeId: 'store-a',
  role: 'seller',
  fullAccess: false,
  accessAreas: [],
  permissions: {},
  ...partial,
});

test('fullAccess libera todas as áreas', () => {
  const access = base({ fullAccess: true });
  assert.equal(canSeeStock(access), true);
  assert.equal(canSeeSales(access), true);
  assert.equal(canSeeOs(access), true);
  assert.equal(canSeeFinance(access), true);
});

test('erp libera subáreas erp_*', () => {
  const access = base({ accessAreas: ['erp'] });
  assert.equal(hasArea(access, 'erp_stock'), true);
  assert.equal(hasArea(access, 'erp_finance'), true);
  assert.equal(canSeeSales(access), false);
});

test('áreas específicas respeitam lista', () => {
  const access = base({ accessAreas: ['os', 'pdv'] });
  assert.equal(canSeeOs(access), true);
  assert.equal(canSeeSales(access), true);
  assert.equal(canSeeStock(access), false);
  assert.equal(canSeeFinance(access), false);
});
