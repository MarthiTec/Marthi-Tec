import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET = "commercial-test-secret-".repeat(4);
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const db = new PGlite();
for (const file of fs
  .readdirSync("apps/api/src/db/migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  if(file.startsWith("0021")) await db.exec("CREATE VIEW commercial_view_regression AS SELECT id,store_id FROM stock_items;");
  if (file.startsWith("0021") && process.env.MARTHI_TEST_PRISMA_SCHEMA === "1")
    await db.exec(`
   CREATE TYPE ticket_status AS ENUM ('open','sold','cancelled');
   ALTER TABLE sales_orders ALTER COLUMN status DROP DEFAULT;
   ALTER TABLE sales_orders ALTER COLUMN status TYPE ticket_status USING status::ticket_status;
   ALTER TABLE sales_orders ADD COLUMN amount NUMERIC(12,2) NOT NULL;
   ALTER TABLE sales_orders ADD COLUMN payment TEXT NOT NULL;
   ALTER TABLE sales_orders ADD COLUMN product_name TEXT NOT NULL;
   ALTER TABLE sales_orders ALTER COLUMN seller_id SET DEFAULT '';
   ALTER TABLE sales_orders ALTER COLUMN seller_id SET NOT NULL;
   ALTER TABLE bank_accounts DROP COLUMN current_balance;
   ALTER TABLE receivables ALTER COLUMN category DROP DEFAULT;
   ALTER TABLE payables ALTER COLUMN category DROP DEFAULT;
   ALTER TABLE sales_order_lines ADD COLUMN order_id TEXT NOT NULL REFERENCES sales_orders(id);
   ALTER TABLE sale_payments ADD COLUMN method_name TEXT NOT NULL;
   ALTER TABLE sale_payments ADD COLUMN type TEXT NOT NULL DEFAULT 'cash';
 `);
  await db.exec(fs.readFileSync("apps/api/src/db/migrations/" + file, "utf8"));
}

// Execute the production SQL against PostgreSQL; only the connection transport is adapted.
const { app } = await import("../dist/app.js");
const { pool } = await import("../dist/db/pool.js");
const { createSessionToken } = await import("../dist/services/authService.js");
const policy = await import("../dist/services/commercialPolicy.js");
const query = async (sql, args = []) => {
  const r = await db.query(sql, args);
  return { ...r, rowCount: r.affectedRows ?? r.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
for (const n of ["a", "b"]) {
  await query(
    "INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')",
    [n],
  );
  await query(
    "INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)",
    ["store-" + n, n],
  );
  await query(
    "INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)",
    ["user-" + n, n, n + "@example.com"],
  );
  await query(
    "INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')",
    ["member-" + n, "user-" + n, "store-" + n],
  );
  await query(
    "INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES($1,$2,$1,'','')",
    ["customer-" + n, "store-" + n],
  );
  await query("INSERT INTO suppliers(id,store_id,name) VALUES($1,$2,$1)", [
    "supplier-" + n,
    "store-" + n,
  ]);
  await query("INSERT INTO bank_accounts(id,store_id,name) VALUES($1,$2,$1)", [
    "account-" + n,
    "store-" + n,
  ]);
}
await query("INSERT INTO suppliers(id,store_id,name) VALUES($1,$2,$1)", [
  "supplier-a2",
  "store-a",
]);
const token = await createSessionToken({
  id: "user-a",
  email: "a@example.com",
  name: "user-a",
  role: "admin",
  clientAccountId: "a",
});
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const req = async (path, method = "GET", body, store = "store-a") => {
  const r = await fetch(base + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      "x-store-id": store,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
};
const good = async (path, method, body, status = 200) => {
  const r = await req(path, method, body);
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body.data;
};

after(async()=>{await new Promise(resolve=>server.close(resolve));await pool.end();await db.close();});
test('attribute automation persists, is idempotent and isolates stores',async()=>{
 await query("UPDATE stores SET segment='assistencia_tecnica' WHERE id='store-a'");
 const first=await good('/attributes/automation');
 assert.equal(first.eligible,true);assert.equal(first.enabled,true);assert.equal(first.attributes.length,3);
 assert.deepEqual(first.attributes.find(a=>a.name==='Tipo de Retirada').values,['Em mão','Por encomenda']);
 const second=await good('/attributes/automation');assert.deepEqual(second.attributes.map(a=>a.id),first.attributes.map(a=>a.id));
 await good('/attributes/automation','PUT',{enabled:false});
 assert.equal((await good('/attributes/automation')).enabled,false);
 assert.equal((await query("SELECT attribute_automation_enabled FROM stores WHERE id='store-a'")).rows[0].attribute_automation_enabled,false);
 const foreign=first.attributes[0].id;
 const cross=await req('/attributes/'+foreign,'PATCH',{name:'Hacked'},'store-b');assert.ok(cross.status>=400);
 assert.equal((await query('SELECT name FROM product_attributes WHERE id=$1',[foreign])).rows[0].name,first.attributes[0].name);
 assert.equal((await query("SELECT count(*)::int AS n FROM product_attributes WHERE store_id='store-b'")).rows[0].n,0);
 await good('/attributes/automation','PUT',{enabled:true});
 assert.equal((await good('/attributes')).length,3);
});
