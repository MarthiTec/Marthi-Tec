import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const navPath = path.join(root, 'apps/web/src/pages/admin/adminNav.ts');
const dirPath = path.join(root, 'apps/web/src/data/screenDirectory.ts');

test('Fase A: navGroupForPath covers PDV + Retaguarda children that were missing', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const fn = nav.slice(nav.indexOf('export function navGroupForPath'));
  for (const fragment of [
    "pathname.startsWith('/painel/cotacao')",
    "pathname.startsWith('/painel/orcamentos')",
    "pathname.startsWith('/painel/calculadora')",
    "pathname.startsWith('/painel/taxas-cartao')",
    "pathname.startsWith('/painel/catalogo')",
    "pathname.startsWith('/painel/solicitacoes-compra')",
  ]) {
    assert.ok(fn.includes(fragment), `missing ${fragment}`);
  }
});

test('Fase A (superseded by A+/B hub): Retaguarda stock entry before vitrine', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const erpBlock = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  const produtos = erpBlock.indexOf("to: '/erp/produtos'");
  const catalogo = erpBlock.indexOf("to: '/painel/catalogo'");
  assert.ok(produtos > 0, 'Produtos & Estoque hub in Retaguarda');
  assert.ok(catalogo > produtos, 'Estoque hub before Catálogo');
  assert.match(erpBlock, /label: 'Produtos & Estoque'/);
});

test('Fase A: PDV order is Operar → Negociar → Configurar → Desempenho', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const pdv = nav.slice(nav.indexOf("id: 'presales'"), nav.indexOf("id: 'os'"));
  const order = [
    '/caixa',
    '/painel/venda-externa',
    '/painel/pdv',
    '/painel/pedidos',
    '/painel/cotacao',
    '/painel/orcamentos',
    '/painel/pagamentos',
    '/painel/taxas-cartao',
    '/painel/calculadora',
    '/painel/metas',
    '/painel/relatorio-vendas',
  ];
  let last = -1;
  for (const to of order) {
    const idx = pdv.indexOf(`to: '${to}'`);
    assert.ok(idx > last, `expected ${to} after previous`);
    last = idx;
  }
});

test('Fase A: Finder synonyms cover inventário / ajuste / sem caixa', () => {
  const dir = fs.readFileSync(dirPath, 'utf8');
  // Após hub A+/B, inventário/ajuste ficam nos sinônimos de /erp/produtos.
  assert.match(dir, /\/erp\/produtos': '[^']*inventario/);
  assert.match(dir, /\/erp\/produtos': '[^']*ajuste de estoque/);
  assert.match(dir, /\/painel\/venda-externa': '[^']*sem caixa/);
});
