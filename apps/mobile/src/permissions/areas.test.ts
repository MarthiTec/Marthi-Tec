import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canManageStock,
  canSeeCost,
  canSeeFinance,
  canSeeOs,
  canSeeSalePrice,
  canSeeSales,
  canSeeStock,
  hasArea,
} from './areas';
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

test('estoque: preço/custo e gestão', () => {
  const stockOnly = base({ accessAreas: ['erp_stock'], role: 'operator', permissions: {} });
  assert.equal(canSeeStock(stockOnly), true);
  assert.equal(canSeeSalePrice(stockOnly), true);
  assert.equal(canSeeCost(stockOnly), true);
  assert.equal(canManageStock(stockOnly), true);

  const seller = base({ accessAreas: ['erp_stock'], role: 'seller', permissions: {} });
  assert.equal(canManageStock(seller), false);
  assert.equal(canManageStock(base({ ...seller, permissions: { canEdit: true } })), true);
});

test('pdv vê preço de venda sem necessariamente custo financeiro', () => {
  const access = base({ accessAreas: ['pdv'] });
  assert.equal(canSeeSalePrice(access), true);
  assert.equal(canSeeFinance(access), false);
});
