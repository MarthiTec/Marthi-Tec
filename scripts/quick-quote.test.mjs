import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const { outputFiles } = buildSync({ entryPoints: ['apps/web/src/data/quickQuote.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { buildQuickQuote, quickQuoteMessage } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

// Taxas da maquininha: 1x 3,5%, 2x 5%, ..., até 18x.
const rates = Array.from({ length: 18 }, (_, i) => (i === 0 ? 3.5 : 3.5 + i * 1.5));

test('margin in percent over the supplier price, no trade-in', () => {
  const quote = buildQuickQuote({ cost: 4250, marginMode: 'percent', margin: 10, tradeIn: 0 }, rates);
  assert.equal(quote.profit, 425);
  assert.equal(quote.cashPrice, 4675);
  assert.equal(quote.toPay, 4675);
  assert.equal(quote.markupPercent, 10);
  assert.equal(quote.marginOnPricePercent, 9.09);
  // 1x no cartão: 4675 × 1,035 = 4838,625 → arredonda para cima no centavo.
  assert.deepEqual(quote.installments[0], { parcels: 1, ratePercent: 3.5, total: 4838.63, installment: 4838.63, interest: 163.63 });
  assert.equal(quote.installments.length, 18);
});

test('margin in reais with the customer device as upgrade: card rate applies only to what is left to pay', () => {
  const quote = buildQuickQuote({ cost: 6200, marginMode: 'money', margin: 500, tradeIn: 2300 }, rates);
  assert.equal(quote.cashPrice, 6700);
  assert.equal(quote.tradeIn, 2300);
  assert.equal(quote.toPay, 4400);
  assert.equal(quote.profit, 500, 'the card rate is paid by the customer, the store keeps its margin');
  const tenX = quote.installments[9];
  assert.equal(tenX.ratePercent, 17);
  assert.equal(tenX.total, 5148);
  assert.equal(tenX.installment, 514.8);
});

test('trade-in worth more than the price never makes the customer pay a negative value', () => {
  const quote = buildQuickQuote({ cost: 1000, marginMode: 'money', margin: 100, tradeIn: 5000 }, rates);
  assert.equal(quote.tradeIn, 1100);
  assert.equal(quote.toPay, 0);
});

test('message for the customer shows prices but never the cost or the margin', () => {
  const quote = buildQuickQuote({ cost: 6200, marginMode: 'money', margin: 500, tradeIn: 2300 }, rates);
  const text = quickQuoteMessage({ device: 'iPhone 16 Pro 256GB', quote, parcels: 10, tradeInDevice: 'iPhone 13', validUntil: '15/10/2026' });
  assert.match(text, /iPhone 16 Pro 256GB/);
  assert.match(text, /À vista \(Pix\/dinheiro\): R\$\s6\.700,00/);
  assert.match(text, /troca \(iPhone 13\): - R\$\s2\.300,00/);
  assert.match(text, /Você paga: R\$\s4\.400,00/);
  assert.match(text, /10x de R\$\s514,80 \(total R\$\s5\.148,00\)/);
  assert.doesNotMatch(text, /6\.200|500,00|margem|custo/i);
});
