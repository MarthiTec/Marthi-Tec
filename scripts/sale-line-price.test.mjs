import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const esm = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const conditionUrl = 'data:text/javascript;base64,' + Buffer.from(esm('apps/web/src/data/productCondition.ts')).toString('base64');
const source = esm('apps/web/src/data/productPickup.ts').replace("'./productCondition'", JSON.stringify(conditionUrl));
const { saleLineUnitPrice, saleLinePickupProduct } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const iphone = {
  price: 7300,
  pickupPrices: {},
  variations: [
    { attrs: { cor: 'Preto', cap: '256GB' }, price: 7500, qty: 1, pickupPrices: { hand: 7500, order: 7300 } },
    { attrs: { cor: 'Azul', cap: '128GB' }, price: 6900, qty: 1, pickupPrices: { hand: 6900, order: 6700 } },
  ],
};

test('price follows the chosen variation and pickup type (in hand vs order)', () => {
  const black = [{ id: 'cor', value: 'Preto' }, { id: 'cap', value: '256GB' }];
  assert.equal(saleLineUnitPrice(iphone, black, 'hand'), 7500);
  assert.equal(saleLineUnitPrice(iphone, black, 'order'), 7300);
  const blue = [{ id: 'cor', value: 'azul' }, { id: 'cap', value: '128 GB' }];
  assert.equal(saleLineUnitPrice(iphone, blue, 'order'), 6700, '"128 GB"/"azul" match the variation');
  assert.equal(saleLineUnitPrice(iphone, blue, undefined), 6900, 'without pickup type: variation price');
  assert.deepEqual(saleLinePickupProduct(iphone, blue).pickupPrices, { hand: 6900, order: 6700 });
  assert.equal(saleLineUnitPrice({ price: 50, pickupPrices: { hand: 50, order: 40 } }, [], 'order'), 40, 'product without variations');
});

test('same color/capacity as new and used: the price follows the chosen condition', () => {
  const stock = {
    price: 5000,
    variations: [
      { attrs: { cor: 'Preto' }, price: 5000, qty: 1, condition: 'new', pickupPrices: {} },
      { attrs: { cor: 'Preto' }, price: 3500, qty: 1, condition: 'used', pickupPrices: {} },
    ],
  };
  assert.equal(saleLineUnitPrice(stock, [{ id: 'cor', value: 'Preto' }, { id: '__condition', value: 'Usado' }]), 3500);
  assert.equal(saleLineUnitPrice(stock, [{ id: 'cor', value: 'Preto' }, { id: '__condition', value: 'Novo' }]), 5000);
});
