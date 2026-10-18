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
const { parseAppleSpecs, appleSpecsUrl } = await import('../dist/services/appleSpecs.js');
const query = async (sql, args = []) => { const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
pool.query = query;
pool.connect = async () => ({ query, release() {} });
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });

// Lista de modelos (já em cache) com o link oficial de especificações de cada um.
await query(`INSERT INTO device_reference_sources (source_url, data) VALUES ($1, $2::jsonb)`, [
  'https://support.apple.com/pt-br/108044',
  JSON.stringify([
    { brand: 'Apple', model: 'iPhone 17 Pro Max', colors: ['Laranja-cósmico'], capacities: ['256GB', '512GB'], sourceUrl: 'https://support.apple.com/125091', image: 'https://support.apple.com/x.png' },
    { brand: 'Apple', model: 'iPhone 12', colors: ['Azul'], capacities: ['64GB'], sourceUrl: 'https://support.apple.com/kb/SP830?locale&#x3D;pt_BR', image: 'https://support.apple.com/y.png' },
  ]),
]);

const SPEC_PAGE = `<html><body>
<h3>Tela</h3><ul><li><p>Super&nbsp;Retina&nbsp;XDR</p></li><li><p>OLED sem bordas de 6,9&nbsp;polegadas (na&nbsp;diagonal)</p></li><li><p>HDR</p></li></ul>
<h3>Chip</h3><ul><li><p>A19&nbsp;Pro</p></li><li><p>CPU de 6&nbsp;n&uacute;cleos</p></li><li><p>Tra&ccedil;ado de raios</p></li></ul>
<h3>C&acirc;mera</h3><ul><li><p>Fusion principal de 48&nbsp;MP: 24&nbsp;mm</p></li><li><p>Tamb&eacute;m possibilita teleobjetiva de 2x de 12 MP</p></li><li><p>Fusion ultra-angular de 48&nbsp;MP: 13 mm</p></li></ul>
<h3>C&acirc;mera frontal</h3><ul><li><p>C&acirc;mera Center&nbsp;Stage de 18&nbsp;MP</p></li></ul>
<h3>Energia e bateria<sup>7</sup></h3><ul><li><p>Reprodu&ccedil;&atilde;o de v&iacute;deo: At&eacute; 37&nbsp;horas</p></li></ul>
<h3>Rede celular e Conex&otilde;es sem fio</h3><ul><li><p>5G (sub-6 GHz) com MIMO 4x4</p></li><li><p>Wi-Fi 7 (802.11be)</p></li><li><p>Bluetooth 6</p></li></ul>
<h3>Bot&otilde;es e conectores externos</h3><ul><li><p>Bot&atilde;o lateral</p></li></ul>
<h3>Recarga e conex&otilde;es</h3><ul><li><p>Porta USB-C compat&iacute;vel com: USB&nbsp;3 (at&eacute; 10&nbsp;Gb/s)</p></li></ul>
<h3>Tamanho e peso<sup>2</sup></h3><p>Largura: 78,0&nbsp;mm</p><p>Altura: 163,4&nbsp;mm</p><p>Espessura: 8,75&nbsp;mm</p><p>Peso: 231&nbsp;gramas</p>
<h3>Cart&atilde;o SIM</h3><ul><li><p>Dual SIM (eSIM e nano SIM)</p></li></ul>
<h3>Sistema operacional</h3><ul><li><p>iOS</p></li></ul>
<h3>Conte&uacute;do da caixa</h3><ul><li><p>iPhone 17 Pro Max</p></li><li><p>Cabo USB-C</p></li></ul>
<script>alert('nunca executa')</script>
<h2>Apple Footer</h2></body></html>`;

let appleCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://support.apple.com/')) {
    appleCalls++;
    const res = new Response(SPEC_PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: url.includes('/kb/') ? 'https://support.apple.com/pt-br/111876' : url });
    return res;
  }
  return realFetch(input, init);
};

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path) => {
  const res = await realFetch(base + path, { headers: { authorization: 'Bearer ' + admin, 'x-store-id': 'store-a' } });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { globalThis.fetch = realFetch; server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('lê a página oficial e monta as linhas curtas da ficha', () => {
  const lines = Object.fromEntries(parseAppleSpecs(SPEC_PAGE, { model: 'iPhone 17 Pro Max', capacities: ['256GB', '512GB'] }).map((l) => [l.label, l.value]));
  assert.equal(lines['Marca'], 'Apple');
  assert.equal(lines['Tamanho da tela'], '6,9 polegadas');
  assert.equal(lines['Processador'], 'A19 Pro · CPU de 6 núcleos');
  assert.equal(lines['Câmera traseira'], 'Fusion principal de 48 MP · Fusion ultra-angular de 48 MP');
  assert.equal(lines['Bateria'], 'Reprodução de vídeo: Até 37 horas');
  assert.equal(lines['Armazenamento'], '256GB · 512GB');
  assert.equal(lines['Conector'], 'USB-C (USB 3)');
  assert.equal(lines['Dimensões'], '163,4 x 78,0 x 8,75 mm (A x L x E)');
  assert.equal(lines['Peso'], '231 gramas');
  assert.equal(lines['Chip'], 'Dual SIM (eSIM e nano SIM)');
  assert.ok(!JSON.stringify(lines).includes('alert'), 'script da página nunca entra na ficha');
});

test('aceita só links do suporte da Apple, em português', () => {
  assert.equal(appleSpecsUrl('https://support.apple.com/125091'), 'https://support.apple.com/pt-br/125091');
  assert.equal(appleSpecsUrl('https://support.apple.com/kb/SP830?locale&#x3D;pt_BR'), 'https://support.apple.com/kb/SP830?locale=pt_BR');
  assert.equal(appleSpecsUrl('https://evil.example/125091'), null);
  assert.equal(appleSpecsUrl('http://support.apple.com/125091'), null);
});

test('rota sugere a ficha pelo nome do produto e guarda no banco', async () => {
  const first = await call('/device-reference/specs?name=' + encodeURIComponent('IPHONE 17 PRO MAX 256GB'));
  assert.equal(first.status, 200);
  assert.equal(first.data.found, true);
  assert.equal(first.data.model, 'iPhone 17 Pro Max');
  assert.ok(first.data.specs.some((l) => l.label === 'Tela'));
  assert.equal(appleCalls, 1);
  const saved = (await query(`SELECT data FROM device_reference_sources WHERE source_url = 'specs:https://support.apple.com/pt-br/125091'`)).rows[0];
  assert.ok(saved && saved.data.length >= 5, 'ficha guardada no banco');
  const again = await call('/device-reference/specs?name=' + encodeURIComponent('iphone 17 pro max'));
  assert.deepEqual(again.data.specs, first.data.specs);
  assert.equal(appleCalls, 1, 'segunda consulta vem do banco, sem ir à Apple');
});

test('modelo antigo usa o link /kb da Apple', async () => {
  const res = await call('/device-reference/specs?name=' + encodeURIComponent('IPHONE 12 64GB'));
  assert.equal(res.data.found, true);
  assert.equal(res.data.sourceUrl, 'https://support.apple.com/kb/SP830?locale=pt_BR');
});

test('nome desconhecido ou curto não inventa ficha', async () => {
  const unknown = await call('/device-reference/specs?name=' + encodeURIComponent('IPHONE 99 ULTRA'));
  assert.equal(unknown.data.found, false);
  assert.deepEqual(unknown.data.specs, []);
  assert.equal((await call('/device-reference/specs?name=ab')).status, 400);
});
