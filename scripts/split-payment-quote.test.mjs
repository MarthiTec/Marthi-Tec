import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const { outputFiles } = buildSync({ entryPoints: ['apps/web/src/data/splitPayment.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { quotePayments } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

const rates = { 3: 6.8, 4: 7, 10: 12 };
const rateFor = (n) => rates[n] ?? 0;
const phone = [{ lineTotal: 2500 }];

test('a single payment is the whole amount, as before (card 4x with the machine rate)', () => {
  const { quotes, cardInterest, totalCharged } = quotePayments([{ method: 'Cartão de Crédito', installments: 4, amount: 0 }], 2400, phone, rateFor);
  assert.deepEqual([quotes[0].base, quotes[0].interest, quotes[0].total, quotes[0].perInstallment], [2400, 168, 2568, 642]);
  assert.deepEqual([cardInterest, totalCharged], [168, 2568]);
});

test('PIX + cash + card: the last one takes what is left and only the card pays interest', () => {
  const { quotes, remainder, cardInterest, totalCharged } = quotePayments(
    [
      { method: 'PIX', installments: 1, amount: 1000 },
      { method: 'Dinheiro', installments: 1, amount: 500 },
      { method: 'Cartão de Crédito', installments: 3, amount: 0 },
    ],
    2500,
    phone,
    rateFor,
  );
  assert.deepEqual(quotes.map((q) => [q.method, q.base, q.interest, q.total]), [['PIX', 1000, 0, 1000], ['Dinheiro', 500, 0, 500], ['Cartão de Crédito', 1000, 68, 1068]]);
  assert.equal(quotes[2].perInstallment, 356);
  assert.deepEqual([remainder, cardInterest, totalCharged], [1000, 68, 2568]);
});

test('PIX installments are ignored, and values above the total show a negative remainder', () => {
  const { quotes, remainder } = quotePayments([{ method: 'PIX', installments: 5, amount: 3000 }, { method: 'Cartão de Crédito', installments: 4, amount: 0 }], 2500, phone, rateFor);
  assert.equal(quotes[0].installments, 1);
  assert.equal(remainder, -500);
  assert.deepEqual([quotes[1].base, quotes[1].interest], [0, 0]);
});

test('a product "without interest up to 10x" keeps its share out of the card interest in a split', () => {
  const lines = [{ lineTotal: 2000, interestFreeInstallments: 10 }, { lineTotal: 500 }];
  const { quotes } = quotePayments([{ method: 'PIX', installments: 1, amount: 500 }, { method: 'Cartão de Crédito', installments: 10, amount: 0 }], 2500, lines, rateFor);
  // Cartão: R$ 2.000, dos quais 20% (a capinha) pagam juros de 12%.
  assert.deepEqual([quotes[1].base, quotes[1].interest], [2000, 48]);
});
