import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((x) => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('apps/api/src/db/migrations/' + file, 'utf8'));
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const query = async (sql, args = []) => { const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
pool.query = query;
pool.connect = async () => ({ query, release() {} });
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test'),('b','b','b','b','b','','Outra')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1'),('store-b','b','Outra','Outra','2')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true),('user-b','b','b@example.com','Outra','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-b','user-b','store-b','admin')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const other = await auth.createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'Outra', role: 'admin', clientAccountId: 'b' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body, token = admin, store = 'store-a') => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const qtyOf = async (id) => Number((await query('SELECT qty FROM stock_items WHERE id = $1', [id])).rows[0].qty);
const newOs = (extra = {}) => ({ customerName: 'Ana', itemName: 'SAMSUNG A01', itemBrand: 'SAMSUNG', itemModel: 'A01', defect: 'Tela quebrada', labor: 75, ...extra });
let telaA01, telaA02, bateria, outra, servico;

test('peças de manutenção: vínculo com o aparelho pelo catálogo de manutenções, estoque mínimo, custo e venda', async () => {
  telaA01 = (await call('/stock', 'POST', { name: 'TELA SAMSUNG A01 INCELL', sku: 'TELA-0001', kind: 'part', category: 'Tela', brand: 'Samsung', qty: 3, minQty: 2, cost: 34, price: 75 })).data;
  // Peças cadastradas pela oficina (estoque da OS); a A01 veio do estoque da loja e entra pela ligação.
  telaA02 = (await call('/repair-parts', 'POST', { name: 'TELA SAMSUNG A02 INCELL', sku: 'TELA-0002', category: 'Tela', brand: 'Samsung', minQty: 1, cost: 33, price: 75 })).data;
  await call(`/repair-parts/${telaA02.id}/entries`, 'POST', { qty: 1, unitCost: 33, payment: 'none' });
  bateria = (await call('/repair-parts', 'POST', { name: 'BATERIA GENÉRICA', minQty: 1, cost: 20, price: 60 })).data;
  await call('/stock', 'POST', { name: 'CAPINHA DA LOJA', kind: 'part', qty: 4, cost: 5, price: 20 });
  outra = (await call('/stock', 'POST', { name: 'TELA DA OUTRA LOJA', kind: 'part', qty: 5, cost: 1, price: 2 }, other, 'store-b')).data;
  servico = (await call('/repair-services', 'POST', { brand: 'SAMSUNG', model: 'A01', category: 'Tela', name: 'TROCA DE TELA', options: [{ name: 'INCELL', price: 75, cost: 34 }] })).data;
  const core = (await call('/repair-services', 'POST', { brand: 'SAMSUNG', model: 'A01 CORE', category: 'Tela', name: 'TROCA DE TELA', options: [{ name: 'INCELL', price: 75, cost: 34 }] })).data;

  const linked = await call(`/repair-parts/${telaA01.id}/links`, 'PUT', { links: [{ serviceId: servico.id, optionId: servico.options[0].id }, { serviceId: core.id, optionId: core.options[0].id }] });
  assert.equal(linked.status, 200, JSON.stringify(linked.error));
  assert.deepEqual(linked.data.links.map((l) => l.model), ['A01', 'A01 CORE'], 'uma tela serve para dois aparelhos');
  await query('UPDATE repair_services SET active = false WHERE id = $1', [core.id]);
  const stillLinked = (await call('/repair-parts')).data.find((p) => p.id === telaA01.id).links;
  assert.deepEqual(stillLinked.map((l) => [l.model, l.serviceActive]), [['A01', true], ['A01 CORE', false]], 'serviço inativo continua mostrando a peça vinculada');
  assert.equal((await call(`/repair-parts/${outra.id}/links`, 'PUT', { links: [] })).status, 404, 'peça de outra loja não');

  const forA01 = (await call('/repair-parts?brand=Samsung&model=a01')).data;
  assert.deepEqual(forA01.map((p) => [p.name, p.qty, p.minQty, p.cost, p.price, p.status]), [['TELA SAMSUNG A01 INCELL', 3, 2, 34, 75, 'ok']]);
  assert.deepEqual((await call('/repair-parts?brand=Samsung&model=A99')).data, [], 'aparelho sem peça vinculada');

  const all = (await call('/repair-parts')).data;
  assert.deepEqual(all.map((p) => [p.name, p.status]), [['BATERIA GENÉRICA', 'out'], ['TELA SAMSUNG A01 INCELL', 'ok'], ['TELA SAMSUNG A02 INCELL', 'low']]);
  assert.ok(!all.some((p) => p.id === outra.id), 'nada de outra loja');

  const edited = await call(`/repair-parts/${telaA02.id}`, 'PATCH', { minQty: 3, cost: 35.5, price: 80 });
  assert.deepEqual([edited.data.minQty, edited.data.cost, edited.data.price, edited.data.qty], [3, 35.5, 80, 1]);
  assert.equal((await call(`/repair-parts/${outra.id}`, 'PATCH', { minQty: 9 })).status, 404);
});

test('abrir OS com a peça do aparelho e uma peça improvisada: baixa, movimentação e custo na mesma transação', async () => {
  const created = await call('/work-orders', 'POST', newOs({
    lines: [{ id: 'srv-1', stockId: telaA01.id, name: 'TROCA DE TELA (INCELL)', qty: 1, unitCost: 34, unitPrice: 75, kind: 'labor' }],
    stockParts: [{ stockId: telaA01.id, qty: 1, unitPrice: 0 }, { stockId: telaA02.id, qty: 1, unitPrice: 0, improvised: true, note: 'aro da A02 no lugar' }],
  }));
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const os = created.data;
  assert.equal(await qtyOf(telaA01.id), 2);
  assert.equal(await qtyOf(telaA02.id), 0);
  const parts = os.lines.filter((l) => l.kind === 'part');
  assert.deepEqual(parts.map((l) => [l.name, l.qty, l.unitCost, l.unitPrice, l.improvised]), [['TELA SAMSUNG A01 INCELL', 1, 34, 0, false], ['TELA SAMSUNG A02 INCELL', 1, 33, 0, true]], 'custo médio das compras (a unidade em estoque custou 33)');
  assert.equal(os.parts, 0, 'peça incluída no serviço não cobra de novo');
  assert.equal(os.labor, 75);
  const moves = (await query(`SELECT qty, previous_qty, new_qty, ref_type, notes FROM stock_movements WHERE ref_id = $1 ORDER BY notes`, [os.id])).rows;
  assert.equal(moves.length, 2);
  assert.ok(moves.every((m) => m.ref_type === 'work_order'));
  assert.ok(moves.some((m) => /improviso/.test(m.notes) && /aro da A02/.test(m.notes)));
  const costs = (await query(`SELECT amount FROM finance_entries WHERE ref_id = $1 AND source = 'os_part'`, [os.id])).rows.map((r) => Number(r.amount)).sort();
  assert.deepEqual(costs, [33, 34]);

  // Peça sem saldo: a OS inteira não é aberta e nada sai do estoque.
  const before = Number((await query('SELECT count(*)::int n FROM work_orders')).rows[0].n);
  const blocked = await call('/work-orders', 'POST', newOs({ stockParts: [{ stockId: telaA01.id, qty: 1 }, { stockId: bateria.id, qty: 1 }] }));
  assert.equal(blocked.status, 409);
  assert.match(blocked.error.message, /Estoque insuficiente de "BATERIA GENÉRICA"/);
  assert.equal(Number((await query('SELECT count(*)::int n FROM work_orders')).rows[0].n), before);
  assert.equal(await qtyOf(telaA01.id), 2, 'nada saiu do estoque');
  assert.equal((await call('/work-orders', 'POST', newOs({ stockParts: [{ stockId: outra.id }] }))).status, 404, 'peça de outra loja não');

  // Linha de peça vinda pronta do navegador não vira estorno no cancelamento.
  const fake = (await call('/work-orders', 'POST', newOs({ lines: [{ id: 'x', stockId: telaA01.id, name: 'TELA', qty: 5, unitCost: 1, unitPrice: 1, kind: 'part' }] }))).data;
  await call(`/work-orders/${fake.id}/cancel`, 'POST');
  assert.equal(await qtyOf(telaA01.id), 2);

  // Na ficha: baixa avulsa cobrada à parte, estorno e cancelamento devolvem uma vez só.
  const added = await call(`/work-orders/${os.id}/parts`, 'POST', { stockId: telaA01.id, qty: 1 });
  assert.equal(added.status, 200, JSON.stringify(added.error));
  assert.equal(added.data.parts, 75, 'sem preço informado = preço de venda da peça');
  assert.equal(await qtyOf(telaA01.id), 1);
  assert.equal((await call(`/work-orders/${os.id}/parts`, 'POST', { stockId: telaA02.id, qty: 1 })).status, 409, 'sem saldo não baixa');
  const line = added.data.lines.filter((l) => l.kind === 'part').at(-1);
  const removed = await call(`/work-orders/${os.id}/parts/${line.id}`, 'DELETE');
  assert.equal(removed.data.parts, 0);
  assert.equal(await qtyOf(telaA01.id), 2);
  await call(`/work-orders/${os.id}/cancel`, 'POST');
  await call(`/work-orders/${os.id}/cancel`, 'POST');
  assert.equal(await qtyOf(telaA01.id), 3, 'cancelar duas vezes não devolve em dobro');
  assert.equal(await qtyOf(telaA02.id), 1);
  const back = (await query(`SELECT count(*)::int n FROM stock_movements WHERE ref_id = $1 AND ref_type = 'work_order_reversal'`, [os.id])).rows[0].n;
  assert.equal(back, 3);
  assert.equal((await call(`/work-orders/${os.id}/parts`, 'POST', { stockId: telaA01.id })).status, 409, 'OS cancelada não baixa peça');
});

test('estoque da oficina: peça nova e entrada pela OS, fora do estoque da loja (Retaguarda)', async () => {
  const created = await call('/repair-parts', 'POST', { name: 'CONECTOR DE CARGA TIPO C', category: 'CONECTOR', brand: 'GENÉRICO', cost: 8, price: 40, minQty: 3, images: ['data:image/jpeg;base64,AAAA'] });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const part = created.data;
  assert.equal(part.scope, 'workshop');
  assert.match(part.sku, /^PEC-/);
  assert.deepEqual([part.qty, part.minQty, part.status, part.images.length], [0, 3, 'out', 1]);

  const loja = (await call('/stock')).data;
  assert.ok(!loja.some((item) => item.id === part.id), 'Retaguarda não mostra peça da oficina');
  assert.ok(loja.some((item) => item.id === telaA01.id), 'estoque da loja continua igual');
  assert.ok((await call('/stock?scope=all')).data.some((item) => item.id === part.id), 'PDV/OS enxergam com scope=all');
  assert.ok((await call('/repair-parts')).data.some((item) => item.id === part.id));

  const entry = await call(`/repair-parts/${part.id}/entries`, 'POST', { qty: 5, unitCost: 10, payment: 'paid', notes: 'Compra na distribuidora' });
  assert.equal(entry.status, 201, JSON.stringify(entry.error));
  assert.deepEqual([entry.data.qty, entry.data.cost, entry.data.status], [5, 10, 'ok']);
  const second = await call(`/repair-parts/${part.id}/entries`, 'POST', { qty: 5, unitCost: 6, payment: 'none' });
  assert.deepEqual([second.data.qty, second.data.cost], [10, 8], 'custo médio');
  const payables = (await query(`SELECT amount, status FROM payables WHERE store_id = 'store-a' AND description LIKE '%CONECTOR%'`)).rows;
  assert.deepEqual(payables.map((p) => [Number(p.amount), p.status]), [[50, 'paid']], 'só a compra paga entra no financeiro');
  const moves = (await query(`SELECT qty, ref_type FROM stock_movements WHERE stock_id = $1 ORDER BY created_at`, [part.id])).rows;
  assert.deepEqual(moves.map((m) => [Number(m.qty), m.ref_type]), [[5, 'supplier_entry'], [5, 'supplier_entry']]);
  assert.equal((await call(`/repair-parts/${part.id}/entries`, 'POST', { qty: 1, unitCost: 1 }, other, 'store-b')).status, 404, 'outra loja não');

  // Usada na OS: sai do estoque da oficina.
  const os = await call('/work-orders', 'POST', newOs({ stockParts: [{ stockId: part.id, qty: 2, unitPrice: 0 }] }));
  assert.equal(os.status, 201, JSON.stringify(os.error));
  assert.equal(await qtyOf(part.id), 8);
  const renamed = await call(`/repair-parts/${part.id}`, 'PATCH', { name: 'CONECTOR TIPO C', images: [] });
  assert.deepEqual([renamed.data.name, renamed.data.images.length], ['CONECTOR TIPO C', 0]);
});

test('migração 0109: peça já ligada a uma qualidade passa para o estoque da oficina; o resto da loja não', async () => {
  const capinha = (await query(`SELECT id FROM stock_items WHERE name = 'CAPINHA DA LOJA'`)).rows[0].id;
  assert.equal((await query('SELECT scope FROM stock_items WHERE id = $1', [telaA01.id])).rows[0].scope, 'store', 'veio do estoque da loja');
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0109_workshop_stock_scope.sql', 'utf8'));
  assert.equal((await query('SELECT scope FROM stock_items WHERE id = $1', [telaA01.id])).rows[0].scope, 'workshop');
  assert.equal((await query('SELECT scope FROM stock_items WHERE id = $1', [capinha])).rows[0].scope, 'store');
  assert.ok(!(await call('/stock')).data.some((item) => item.id === telaA01.id), 'some da Retaguarda');
});

test('encomenda de peça: OS abre aguardando, peça chega, entra no estoque da oficina e vai para a OS', async () => {
  const fornecedor = (await query(`INSERT INTO suppliers (id, store_id, name, trade_name) VALUES ('sup-1', 'store-a', 'Distribuidora', 'Distribuidora Peças') RETURNING id`)).rows[0];
  const created = await call('/work-orders', 'POST', newOs({
    customerPhone: '(32) 98888-7777',
    partOrders: [{ stockId: null, description: 'Tela Moto G04 com aro', qty: 1, unitCost: 45, supplierId: fornecedor.id, expectedAt: '2026-10-21', deviceAtStore: false }],
  }));
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const os = created.data;
  assert.equal(os.status, 'waiting', 'OS aguardando a peça');
  const orders = (await call(`/repair-part-orders?workOrderId=${os.id}`)).data;
  assert.equal(orders.length, 1);
  assert.deepEqual([orders[0].partName, orders[0].supplierName, orders[0].expectedAt, orders[0].deviceAtStore, orders[0].status, orders[0].customerName], ['Tela Moto G04 com aro', 'Distribuidora Peças', '2026-10-21', false, 'ordered', 'Ana']);
  assert.equal((await call('/repair-part-orders', 'GET', undefined, other, 'store-b')).data.length, 0, 'outra loja não vê');

  const rescheduled = await call(`/repair-part-orders/${orders[0].id}`, 'PATCH', { expectedAt: '2026-10-23', notes: 'Fornecedor atrasou' });
  assert.equal(rescheduled.data.expectedAt, '2026-10-23');

  const arrived = await call(`/repair-part-orders/${orders[0].id}/arrive`, 'POST', { unitCost: 48, payment: 'pending', dueDate: '2026-11-05' });
  assert.equal(arrived.status, 200, JSON.stringify(arrived.error));
  assert.equal(arrived.data.usedOn, os.id);
  assert.equal(arrived.data.order.status, 'arrived');
  const part = (await call('/repair-parts')).data.find((p) => p.id === arrived.data.order.stockId);
  assert.deepEqual([part.name, part.qty, part.cost, part.scope], ['TELA MOTO G04 COM ARO', 0, 48, 'workshop'], 'entrou e já saiu para a OS');
  const fresh = (await call(`/work-orders/${os.id}`)).data;
  assert.equal(fresh.status, 'open', 'OS volta para aberta');
  assert.ok(fresh.lines.some((l) => l.kind === 'part' && l.stockId === part.id && l.unitPrice === 0));
  const payable = (await query(`SELECT amount, status, due_date FROM payables WHERE description LIKE '%MOTO G04%'`)).rows[0];
  assert.deepEqual([Number(payable.amount), payable.status], [48, 'open'], 'compra a pagar');
  assert.equal((await call(`/repair-part-orders/${orders[0].id}/arrive`, 'POST', { unitCost: 48 })).status, 409, 'não recebe duas vezes');

  // Encomenda avulsa (repor estoque) e cancelada.
  const avulsa = await call('/repair-part-orders', 'POST', { order: { stockId: telaA02.id, qty: 2, expectedAt: '2020-01-01' } });
  assert.equal(avulsa.status, 201, JSON.stringify(avulsa.error));
  assert.equal(avulsa.data.late, true, 'prazo vencido aparece atrasado');
  const cancelled = await call(`/repair-part-orders/${avulsa.data.id}`, 'PATCH', { status: 'cancelled' });
  assert.equal(cancelled.data.status, 'cancelled');
  assert.equal((await call('/repair-part-orders', 'POST', { order: { description: 'x' } })).status, 400);
});

test('relatório de peças: estoque, no mínimo, consumo nas OS e compras do período, encomendas pendentes', async () => {
  await call('/repair-part-orders', 'POST', { order: { description: 'Bateria iPhone 11', qty: 1, expectedAt: '2020-01-02' } });
  const today = new Date().toISOString().slice(0, 10);
  const report = await call(`/repair-part-orders/report?from=2020-01-01&to=${today}`);
  assert.equal(report.status, 200, JSON.stringify(report.error));
  const r = report.data;
  assert.ok(r.stock.parts >= 4);
  assert.ok(r.stock.value > 0);
  assert.ok(r.stock.low.some((p) => p.name === 'BATERIA GENÉRICA' && p.missing >= 1), 'peça sem estoque aparece para comprar');
  const conector = r.usage.find((u) => u.name.startsWith('CONECTOR'));
  assert.equal(conector.qty, 2, 'consumo nas OS');
  assert.ok(r.entries.some((e) => e.name.startsWith('CONECTOR') && e.qty === 10), 'compras do período');
  assert.equal(r.orders.pending, 1);
  assert.equal(r.orders.late, 1);
});

test('aparelhos compatíveis: a mesma peça serve em outros aparelhos, mesmo sem serviço cadastrado', async () => {
  const set = await call(`/repair-parts/${telaA02.id}/devices`, 'PUT', { devices: [{ brand: 'Samsung', model: 'A02s' }, { brand: 'SAMSUNG', model: 'a02S' }, { brand: 'Samsung', model: 'M02' }] });
  assert.equal(set.status, 200, JSON.stringify(set.error));
  assert.deepEqual(set.data.devices.map((d) => d.model), ['A02S', 'M02'], 'sem repetir');
  assert.ok((await call('/repair-parts?brand=Samsung&model=M02')).data.some((p) => p.id === telaA02.id), 'aparece na OS do M02');
  assert.equal((await call('/repair-parts?brand=Motorola&model=M02')).data.length, 0, 'marca diferente não');
  assert.equal((await call(`/repair-parts/${telaA02.id}/devices`, 'PUT', { devices: [] }, other, 'store-b')).status, 404);
  const cleared = await call(`/repair-parts/${telaA02.id}/devices`, 'PUT', { devices: [] });
  assert.deepEqual(cleared.data.devices, []);
});
