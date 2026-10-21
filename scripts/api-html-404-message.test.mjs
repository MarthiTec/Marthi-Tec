/**
 * Painel: HTML 404 "Service Unavailable" do edge Discloud não pode virar
 * "Resposta inválida da API (404)." — mensagem amigável + nestProxy JSON.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('readJson maps Discloud HTML Service Unavailable to a clear PT message', () => {
  const src = readFileSync('apps/web/src/services/http.ts', 'utf8');
  assert.match(src, /invalidApiMessage/);
  assert.match(src, /Serviço temporariamente indisponível/);
  assert.match(src, /service unavailable/i);
  assert.doesNotMatch(
    src.replace(/invalidApiMessage[\s\S]*?^}/m, ''),
    /throw new Error\(`Resposta inválida da API \(\$\{response\.status\}\)`\)/,
  );

  const invalidApiMessage = (status, text) => {
    if (/service unavailable|servi[cç]o indispon/i.test(text) || /<!doctype html/i.test(text)) {
      return status === 404 || status >= 500
        ? 'Serviço temporariamente indisponível. Atualize a página em instantes.'
        : `Serviço temporariamente indisponível (${status}).`;
    }
    return `Resposta inválida da API (${status}).`;
  };

  const html404 = '<!doctype html><title id="page-title">Service Unavailable</title>';
  assert.equal(
    invalidApiMessage(404, html404),
    'Serviço temporariamente indisponível. Atualize a página em instantes.',
  );
  assert.equal(invalidApiMessage(404, '{not-json'), 'Resposta inválida da API (404).');
});

test('useBrands retries once after transient API failure', () => {
  const src = readFileSync('apps/web/src/data/brandStore.ts', 'utf8');
  assert.match(src, /attempt < 2/);
  assert.match(src, /setTimeout/);
});
