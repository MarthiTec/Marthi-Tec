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
const base = `http://127.0.0.1:${server.address().port}/api/v1/commercial`;
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
const profile = {
  segmentId: "comercio_eletronicos",
  enabled: true,
  appleRules: true,
  tradeIn: true,
  supplierComparison: true,
  catalog: true,
  readyMarkup: 10,
  orderMarkup: 5,
  upgradeMarkup: 0,
  usedWarrantyMonths: 6,
  readyUsedWarrantyMonths: 3,
  receiptDays: [2, 3, 4, 5, 6],
  arrivalTime: "08:00",
  cutoffTime: "17:00",
  routes: ["SP / Três Rios", "SP / Juiz de Fora"],
  categories: ["iphone", "watch", "ipad", "mac"],
};
const sourceAt = new Date(Date.now() - 60000).toISOString(),
  validUntil = new Date(Date.now() + 86400000).toISOString();
const offer = {
  supplierId: "supplier-a",
  category: "iphone",
  brand: "Apple",
  model: "iPhone 15",
  capacity: "128GB",
  color: "Preto",
  configuration: "BR",
  condition: "new",
  cost: 3000,
  warrantyMonths: 12,
  warrantyProvider: "apple",
  available: true,
  sourceAt,
  validUntil,
};
const assessment = {
  batteryHealth: 85,
  screen: "ok",
  housing: "ok",
  cameras: "ok",
  faceId: "ok",
  functioning: "ok",
  originalParts: "ok",
  repairs: "unknown",
  damage: "unknown",
  notes: "Conferido pelo operador",
  assessedAt: sourceAt,
};
let newId, usedId, usedSixId, orderId, readyId;
const order = (offerId, extra = {}) => ({
  requestId: randomUUID(),
  customerId: "customer-a",
  offerId,
  mode: "order",
  stockId: null,
  qty: 1,
  tradeIn: null,
  notes: "",
  ...extra,
});
const transition = (id, input) =>
  good(`/orders/${id}/transition`, "POST", input);
after(async () => {
  server.close();
  await once(server, "close");
  await pool.end();
  await db.close();
});

test("profile and segment persist in one store, reject invalid branches and unauthenticated access", async () => {
  assert.equal((await fetch(base + "/state")).status, 401);
  assert.equal((await req("/state", "GET", null, "store-b")).status, 403);
  assert.equal(
    (
      await req("/profile", "PUT", {
        ...profile,
        segmentId: "restaurante_gastronomia",
      })
    ).status,
    400,
  );
  await good("/profile", "PUT", profile);
  assert.deepEqual(
    (
      await query(
        "SELECT settings FROM commercial_profiles WHERE store_id=$1",
        ["store-a"],
      )
    ).rows[0].settings,
    profile,
  );
  assert.equal(
    (
      await query(
        "SELECT count(*) n FROM commercial_profiles WHERE store_id=$1",
        ["store-b"],
      )
    ).rows[0].n,
    0,
  );
  const settings = {
    segmentId: "comercio_eletronicos",
    segmentName: "Eletrônicos",
    showImei: true,
    showDevicePassword: false,
    showTablesAndKitchen: false,
    showCardapioDigital: false,
    showTechnicalBench: false,
    showSizeColorGrid: false,
  };
  await good("/segment", "PUT", settings);
  assert.deepEqual((await good("/segment")).settings, settings);
});
test("offer history, exact variants, cheapest purchase and six-month warranty are enforced", async () => {
  [newId] = await good("/offers", "POST", [offer], 201);
  [usedId] = await good(
    "/offers",
    "POST",
    [
      {
        ...offer,
        model: "iPhone 12",
        condition: "used",
        cost: 1400,
        warrantyProvider: "supplier",
        warrantyMonths: 3,
      },
    ],
    201,
  );
  [usedSixId] = await good(
    "/offers",
    "POST",
    [
      {
        ...offer,
        supplierId: "supplier-a2",
        model: "iPhone 12",
        condition: "used",
        cost: 1600,
        warrantyProvider: "supplier",
        warrantyMonths: 6,
      },
    ],
    201,
  );
  assert.equal((await req("/orders", "POST", order(usedId))).status, 409);
  const used = await good("/orders", "POST", order(usedSixId), 201);
  assert.equal(used.details.unitPrice, 1680);
  assert.equal(
    (await req("/offers", "POST", [{ ...offer, supplierId: "supplier-b" }]))
      .status,
    404,
  );
  const latest = policy.currentOffers([
    { ...offer, id: "old", active: true },
    {
      ...offer,
      id: "new",
      active: true,
      available: false,
      sourceAt: new Date(Date.now() - 1000).toISOString(),
    },
  ]);
  assert.equal(latest.valid.length, 0);
  const conflict = policy.currentOffers([
    { ...offer, id: "one", active: true },
    { ...offer, id: "two", active: true, cost: 3100 },
  ]);
  assert.equal(conflict.conflicts.length, 1);
  assert.notEqual(
    policy.variantKey(offer),
    policy.variantKey({ ...offer, color: "Azul" }),
  );
  assert.equal(policy.priceFor(3000, profile, "ready", false), 3300);
  assert.equal(policy.priceFor(3000, profile, "order", false), 3150);
  assert.equal(policy.priceFor(3000, profile, "order", true), 3000);
});
test("upgrade quotation is manual below market and never receives the used device early", async () => {
  const trade = {
    referenceOfferId: usedId,
    deviceName: "iPhone 12",
    imei: "customer-used-imei",
    offerValue: 1000,
    assessment,
  };
  const rejected = await req(
    "/orders",
    "POST",
    order(newId, { tradeIn: { ...trade, offerValue: 1400 } }),
  );
  assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
  const payload = order(newId, { tradeIn: trade });
  const saved = await good("/orders", "POST", payload, 201);
  orderId = saved.id;
  assert.equal(saved.details.unitPrice, 3000);
  assert.equal(saved.details.netTotal, 2000);
  assert.equal(
    (await query("SELECT count(*) n FROM stock_items")).rows[0].n,
    0,
  );
  assert.equal((await good("/orders", "POST", payload, 201)).id, orderId);
  assert.equal(
    (await req("/orders", "POST", { ...payload, notes: "Changed operation" }))
      .status,
    409,
  );
  await transition(orderId, { status: "confirmed" });
  assert.equal(
    (
      await req(`/orders/${orderId}/transition`, "POST", {
        status: "purchased",
        expectedAt: validUntil,
        route: "SP",
      })
    ).status,
    409,
  );
});
test("advance is recorded once in financial account, then purchase creates real supplier liability", async () => {
  const payment = {
    requestId: randomUUID(),
    amount: 2000,
    accountId: "account-a",
    method: "Pix",
    kind: "payment",
  };
  await good(`/orders/${orderId}/payments`, "POST", payment);
  await good(`/orders/${orderId}/payments`, "POST", payment);
  assert.equal(
    (
      await query("SELECT count(*) n FROM finance_entries WHERE ref_id=$1", [
        orderId,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    Number(
      (
        await query(
          "SELECT current_balance FROM bank_accounts WHERE id='account-a'",
        )
      ).rows[0].current_balance,
    ),
    2000,
  );
  assert.equal(
    (
      await req(`/orders/${orderId}/payments`, "POST", {
        ...payment,
        amount: 100,
      })
    ).status,
    409,
  );
  assert.equal(
    (await query("SELECT count(*) n FROM stock_items")).rows[0].n,
    0,
  );
  await transition(orderId, {
    status: "purchased",
    expectedAt: validUntil,
    route: "SP / Três Rios",
  });
  const payable = (await query("SELECT * FROM payables")).rows[0];
  assert.equal(Number(payable.amount), 3000);
  assert.equal(payable.supplier_id, "supplier-a");
  await transition(orderId, {
    status: "in_transit",
    tracking: "Viagem confirmada",
  });
  assert.equal(
    (await query("SELECT count(*) n FROM stock_items")).rows[0].n,
    0,
  );
});
test("physical receipt reserves stock; ordinary PDV and external sales cannot consume it", async () => {
  assert.equal(
    (await req(`/orders/${orderId}/transition`, "POST", { status: "received" }))
      .status,
    400,
  );
  const received = await transition(orderId, {
    status: "received",
    physicalReceiptConfirmed: true,
    deliveredImei: "new-device-imei",
  });
  assert.equal(
    (
      await query("SELECT qty FROM stock_items WHERE id=$1", [
        received.details.stockId,
      ])
    ).rows[0].qty,
    1,
  );
  const state = await good("/state");
  assert.equal(
    Number(
      state.stock.find((s) => s.id === received.details.stockId).available_qty,
    ),
    0,
  );
  const response = await fetch(
    base.replace("/commercial", "") + "/sales/external",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "x-store-id": "store-a",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customerId: "customer-a",
        paymentMethod: "Pix",
        lines: [
          {
            stockId: received.details.stockId,
            name: "iPhone",
            qty: 1,
            unitPrice: 3300,
          },
        ],
      }),
    },
  );
  assert.equal(response.status, 400);
  assert.equal(
    (
      await req(`/orders/${orderId}/transition`, "POST", {
        status: "delivered",
      })
    ).status,
    409,
  );
});
test("reassessment updates real receivable; delivery receives used only after confirmation without double income", async () => {
  const prior = await good(`/orders/${orderId}`);
  const t = prior.details.tradeIn;
  await good(`/orders/${orderId}/reassess`, "POST", {
    referenceOfferId: t.referenceOfferId,
    deviceName: t.deviceName,
    imei: t.imei,
    offerValue: 900,
    assessment,
  });
  assert.equal(
    (
      await req(`/orders/${orderId}/transition`, "POST", {
        status: "delivered",
        sameConditionConfirmed: true,
        dataTransferConfirmed: true,
      })
    ).status,
    409,
  );
  await good(`/orders/${orderId}/payments`, "POST", {
    requestId: randomUUID(),
    amount: 100,
    accountId: "account-a",
    method: "Pix",
    kind: "payment",
  });
  const delivered = await transition(orderId, {
    status: "delivered",
    sameConditionConfirmed: true,
    dataTransferConfirmed: true,
  });
  assert.equal(
    Number(
      (
        await query("SELECT qty FROM stock_items WHERE id=$1", [
          delivered.details.stockId,
        ])
      ).rows[0].qty,
    ),
    0,
  );
  const used = (
    await query("SELECT * FROM stock_items WHERE imei='customer-used-imei'")
  ).rows[0];
  assert.equal(used.qty, 1);
  assert.equal(Number(used.cost), 900);
  assert.equal(Number(used.price), 0);
  assert.equal(
    (
      await query("SELECT count(*) n FROM finance_entries WHERE ref_id=$1", [
        orderId,
      ])
    ).rows[0].n,
    2,
  );
  assert.equal(
    (await query("SELECT count(*) n FROM sales_orders")).rows[0].n,
    1,
  );
  await transition(orderId, {
    status: "delivered",
    sameConditionConfirmed: true,
    dataTransferConfirmed: true,
  });
  assert.equal(
    (await query("SELECT count(*) n FROM sales_orders")).rows[0].n,
    1,
  );
});
test("cancellation reverses actual stock, refunds are explicit and supplier liability remains", async () => {
  assert.equal(
    (
      await req(`/orders/${orderId}/transition`, "POST", {
        status: "cancelled",
        notes: "Devolução",
      })
    ).status,
    400,
  );
  await transition(orderId, {
    status: "cancelled",
    notes: "Devolução",
    physicalReceiptConfirmed: true,
  });
  await good(`/orders/${orderId}/payments`, "POST", {
    requestId: randomUUID(),
    amount: 2100,
    accountId: "account-a",
    method: "Pix",
    kind: "refund",
  });
  assert.equal(
    (await query("SELECT qty FROM stock_items WHERE imei='customer-used-imei'"))
      .rows[0].qty,
    0,
  );
  assert.equal((await query("SELECT count(*) n FROM payables")).rows[0].n, 1);
  assert.equal(
    (
      await query(
        "SELECT SUM(CASE WHEN type='in' THEN amount ELSE -amount END) total FROM finance_entries WHERE ref_id=$1",
        [orderId],
      )
    ).rows[0].total,
    "0.00",
  );
});
test("ready delivery price, reservations and WhatsApp output reflect physical and supplier availability", async () => {
  const stock = (
    await query("SELECT * FROM stock_items WHERE imei='new-device-imei'")
  ).rows[0];
  const ready = await good(
    "/orders",
    "POST",
    order(newId, { mode: "ready", stockId: stock.id }),
    201,
  );
  readyId = ready.id;
  assert.equal(ready.details.unitPrice, 3300);
  await transition(readyId, { status: "confirmed" });
  const extra = await good("/orders", "POST", order(newId), 201); // supplier quote has no physical reservation
  assert.equal(extra.details.unitPrice, 3150);
  const linked = (
    await query("SELECT receivable_id FROM commercial_orders WHERE id=$1", [
      readyId,
    ])
  ).rows[0];
  const generic = await fetch(
    base.replace("/commercial", "") +
      `/finance/receivables/${linked.receivable_id}/settle`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "x-store-id": "store-a",
        "content-type": "application/json",
      },
      body: JSON.stringify({ accountId: "account-a" }),
    },
  );
  assert.equal(generic.status, 409);
  const catalog = await good("/catalog");
  assert.ok(!catalog.text.includes("Pronta entrega —"));
  assert.ok(!catalog.text.includes("supplier-a"));
  assert.ok(!catalog.text.includes("10%"));
  await transition(readyId, { status: "cancelled", notes: "Reserva liberada" });
  assert.ok((await good("/catalog")).text.includes("Pronta entrega —"));
  await assert.rejects(
    query(
      "INSERT INTO commercial_offers(id,store_id,supplier_id,variant_key,details,source_at,valid_until) VALUES('foreign','store-a','supplier-b','x','{}',now(),now())",
    ),
  );
});
