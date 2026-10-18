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
await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('cust-1','store-a','Joana Já Cadastrada','(32) 99999-1234','32999991234')`);
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
const pub = async (path, body) => {
  const res = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const tela = (await call('/stock', 'POST', { name: 'TELA OLED IPHONE 16 PRO MAX', kind: 'product', qty: 3, price: 1200, cost: 700 })).data;
const otherStock = (await call('/stock', 'POST', { name: 'PEÇA DA OUTRA LOJA', kind: 'product', qty: 1, price: 10, cost: 5 }, other, 'store-b')).data;
const catalog = (await call('/sales-catalogs', 'POST', { title: 'Catálogo', productIds: [] })).data;
const M = { brand: 'Apple', model: 'iPhone 16 Pro Max' };
let screen, battery, faceId, requestId;

test('painel cadastra serviços por modelo, com peças/qualidades e vínculo ao estoque da própria loja', async () => {
  const created = await call('/repair-services', 'POST', {
    ...M, category: 'Tela', name: 'Troca de tela', description: 'Selecione a qualidade da peça', estimatedMinutes: 120, internalNotes: 'Conferir Face ID antes',
    options: [
      { name: 'Compatível', price: 650 },
      { name: 'OLED', price: 950, stockItemId: tela.id },
      { name: 'Original', price: null },
      { name: 'Premium (sem estoque)', price: 1100, active: false },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  screen = created.data;
  assert.ok(screen.options.every((option) => option.id));
  battery = (await call('/repair-services', 'POST', { ...M, category: 'Bateria', name: 'Troca de bateria', price: 450, estimatedMinutes: 60 })).data;
  faceId = (await call('/repair-services', 'POST', { ...M, category: 'Face ID', name: 'Reparo Face ID', description: 'Sujeito a avaliação técnica', price: null })).data;
  await call('/repair-services', 'POST', { ...M, name: 'Serviço desativado', price: 10, active: false });
  await call('/repair-services', 'POST', { brand: 'Samsung', model: 'Galaxy S24', name: 'Troca de tela', price: 800 });
  const foreign = await call('/repair-services', 'POST', { ...M, name: 'Com peça de outra loja', options: [{ name: 'X', price: 1, stockItemId: otherStock.id }] });
  assert.equal(foreign.status, 400, 'peça de outra loja é recusada');
  assert.equal((await call('/repair-services')).data.length, 5);
  assert.equal((await call('/repair-services', 'GET', null, other, 'store-b')).data.length, 0, 'outra loja não vê os serviços');
});

test('cliente vê só o que está cadastrado e ativo, sem observação interna nem vínculo de estoque', async () => {
  const brands = (await pub(`/public/sales-catalogs/${catalog.token}/repairs`)).data.brands;
  assert.deepEqual(brands, [{ brand: 'Apple', models: ['iPhone 16 Pro Max'] }, { brand: 'Samsung', models: ['Galaxy S24'] }]);
  const services = (await pub(`/public/sales-catalogs/${catalog.token}/repairs/services?brand=Apple&model=${encodeURIComponent(M.model)}`)).data;
  assert.deepEqual(services.map((s) => s.name).sort(), ['Reparo Face ID', 'Troca de bateria', 'Troca de tela']);
  const tela = services.find((s) => s.name === 'Troca de tela');
  assert.deepEqual(tela.options.map((o) => [o.name, o.price]), [['Compatível', 650], ['OLED', 950], ['Original', null]]);
  const json = JSON.stringify(services);
  assert.ok(!json.includes('Conferir Face ID') && !json.includes('stockItemId'), 'nada interno vai para o cliente');
});

test('cliente envia a solicitação: preço sempre do cadastro, protocolo, cliente já cadastrado reconhecido pelo WhatsApp', async () => {
  const optionOled = screen.options.find((o) => o.name === 'OLED').id;
  const missingOption = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, { ...M, items: [{ serviceId: screen.id }], customer: { name: 'Joana Lima', phone: '(32) 99999-1234' } });
  assert.equal(missingOption.status, 400, 'serviço com qualidades exige escolher a opção');
  const wrongModel = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, { brand: 'Samsung', model: 'Galaxy S24', items: [{ serviceId: battery.id }], customer: { name: 'Joana Lima', phone: '(32) 99999-1234' } });
  assert.equal(wrongModel.status, 400, 'serviço de outro modelo é recusado');
  const bot = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, { ...M, items: [{ serviceId: battery.id }], customer: { name: 'Robô', phone: '(32) 90000-0000' }, website: 'spam' });
  assert.equal(bot.status, 400);

  const body = { ...M, requestKey: 'req-12345678', items: [{ serviceId: screen.id, optionId: optionOled, price: 1 }, { serviceId: battery.id }, { serviceId: faceId.id }], description: 'Caiu, a tela ficou verde e o touch parou.', customer: { name: 'Joana Lima', phone: '(32) 99999-1234' } };
  const sent = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, body);
  assert.equal(sent.status, 201, JSON.stringify(sent.error));
  assert.equal(sent.data.protocol, 'MNT-00001');
  assert.equal(sent.data.estimatedTotal, 1400, '950 + 450, ignorando o preço vindo do navegador');
  assert.equal(sent.data.hasEvaluation, true, 'Face ID é sob avaliação');
  assert.ok(!JSON.stringify(sent.data).includes('cust-1'), 'dados do cadastro não voltam para o navegador');
  const again = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, body);
  assert.equal(again.data.protocol, 'MNT-00001', 'reenvio (mesma chave) não duplica');
  const row = (await query('SELECT * FROM repair_requests WHERE protocol = $1', ['MNT-00001'])).rows[0];
  assert.equal(row.customer_id, 'cust-1');
  assert.equal(row.status, 'pending');
  requestId = row.id;
  const second = await pub(`/public/sales-catalogs/${catalog.token}/repairs`, { ...M, items: [], description: 'Não liga mais depois que molhou.', customer: { name: 'Carlos Souza', phone: '(32) 98888-0000' } });
  assert.equal(second.data.protocol, 'MNT-00002');
  assert.equal(Number((await query('SELECT count(*)::int n FROM work_orders')).rows[0].n), 0, 'nenhuma OS criada no envio');
  assert.equal(Number((await query('SELECT qty FROM stock_items WHERE id = $1', [tela.id])).rows[0].qty), 3, 'estoque não baixa');
});

test('fila de solicitações no módulo de OS: busca, contagem de novas e isolamento entre lojas', async () => {
  const list = (await call('/repair-requests')).data;
  assert.deepEqual(list.map((r) => r.protocol), ['MNT-00002', 'MNT-00001']);
  assert.equal(list[1].origin, 'Catálogo Digital');
  assert.equal((await call('/repair-requests?q=99999')).data.length, 1, 'busca pelo WhatsApp');
  assert.equal((await call('/repair-requests?q=mnt-00002')).data[0].customerName, 'Carlos Souza');
  assert.equal((await call('/repair-requests/summary')).data.pending, 2);
  assert.equal((await call('/repair-requests', 'GET', null, other, 'store-b')).data.length, 0);
  assert.equal((await call(`/repair-requests/${requestId}`, 'GET', null, other, 'store-b')).status, 404);
});

test('avaliação presencial: status, dados completados, serviços finais e previsão com histórico', async () => {
  assert.equal((await call(`/repair-requests/${requestId}`, 'PATCH', { status: 'awaiting_device' })).data.statusLabel, 'Aguardando aparelho');
  const evaluated = await call(`/repair-requests/${requestId}`, 'PATCH', {
    status: 'evaluating',
    evaluation: {
      customer: { document: '123.456.789-09' },
      device: { color: 'Titânio deserto', capacity: '256GB', imei: '356000000000001', screen: 'Trincada', accessories: 'Capinha' },
      diagnosis: { found: 'Display danificado; Face ID ok', risks: 'Tampa com microtrincas' },
      items: [{ serviceId: screen.id, name: 'Troca de tela', optionName: 'OLED', stockItemId: tela.id, price: 950 }, { serviceId: battery.id, name: 'Troca de bateria', price: 450 }],
      finalTotal: 1350,
      eta: '2026-10-18T17:00',
    },
  });
  assert.equal(evaluated.status, 200, JSON.stringify(evaluated.error));
  const moved = await call(`/repair-requests/${requestId}`, 'PATCH', { status: 'awaiting_approval', evaluation: { eta: '2026-10-18T18:00' } });
  assert.deepEqual(moved.data.evaluation.etaHistory.map((h) => h.to), ['2026-10-18T17:00', '2026-10-18T18:00'], 'previsão guarda o histórico');
  assert.equal(moved.data.evaluation.device.color, 'Titânio deserto', 'dados anteriores ficam');
  assert.ok(moved.data.history.length >= 5);
});

test('aprovar e abrir OS: cria a OS real uma única vez, com tudo transferido', async () => {
  assert.equal((await call(`/repair-requests/${requestId}/convert`, 'POST', {})).status, 400, 'precisa registrar a forma da aprovação');
  const done = await call(`/repair-requests/${requestId}/convert`, 'POST', { approvalMethod: 'whatsapp', approvalNote: 'Cliente confirmou às 14h' });
  assert.equal(done.status, 201, JSON.stringify(done.error));
  const osId = done.data.workOrderId;
  const os = (await call(`/work-orders/${osId}`)).data;
  assert.equal(os.customerName, 'Joana Lima');
  assert.equal(os.itemName, 'Apple iPhone 16 Pro Max');
  assert.equal(os.itemColor, 'Titânio deserto');
  assert.equal(os.itemRef, '356000000000001');
  assert.equal(os.defect, 'Caiu, a tela ficou verde e o touch parou.');
  assert.equal(os.diagnosis, 'Display danificado; Face ID ok');
  assert.equal(os.estimatedReadyAt, '2026-10-18T18:00');
  assert.equal(os.labor, 1350);
  assert.equal(os.quoteStatus, 'approved');
  assert.match(os.notes, /MNT-00001/);
  assert.match(os.notes, /WhatsApp/);
  assert.equal(os.status, 'open');
  const again = await call(`/repair-requests/${requestId}/convert`, 'POST', { approvalMethod: 'presencial' });
  assert.equal(again.status, 409, 'não abre outra OS');
  assert.equal(Number((await query('SELECT count(*)::int n FROM work_orders')).rows[0].n), 1);
  const request = (await call(`/repair-requests/${requestId}`)).data;
  assert.equal(request.status, 'converted');
  assert.equal(request.workOrderId, osId);
  assert.equal((await call(`/repair-requests/${requestId}`, 'PATCH', { status: 'pending' })).status, 409, 'convertida não volta');
  assert.equal(Number((await query('SELECT qty FROM stock_items WHERE id = $1', [tela.id])).rows[0].qty), 3, 'conversão não baixa estoque sozinha');
});

test('cliente acompanha pelo protocolo + WhatsApp; link sem manutenção não mostra nada', async () => {
  assert.equal((await pub(`/public/sales-catalogs/${catalog.token}/repairs/track?protocol=MNT-00001&phone=32900000000`)).status, 404, 'WhatsApp errado não mostra');
  const track = await pub(`/public/sales-catalogs/${catalog.token}/repairs/track?protocol=mnt-00001&phone=(32)%2099999-1234`);
  assert.equal(track.status, 200, JSON.stringify(track.error));
  assert.equal(track.data.statusLabel, 'Convertida em OS');
  assert.equal(track.data.workOrder.statusLabel, 'Em análise na oficina');
  assert.ok(!JSON.stringify(track.data).includes('Joana'), 'acompanhamento não devolve dados pessoais');
  await call(`/sales-catalogs/${catalog.id}`, 'PATCH', { title: 'Catálogo', productIds: [], showRepairs: false });
  assert.equal((await pub(`/public/sales-catalogs/${catalog.token}/repairs`)).status, 404);
});
