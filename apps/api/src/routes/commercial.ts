import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { markUnitsSold, unmarkSaleUnits } from "../services/soldUnits.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  amount,
  allowedOffer,
  catalogText,
  currentOffers,
  fail,
  offerSchema,
  priceFor,
  profileSchema,
  selectOffer,
  stockMatches,
  variantKey,
  warrantyFor,
  type CommercialProfile,
  type Offer,
} from "../services/commercialPolicy.js";

export const commercialRouter = Router();
commercialRouter.use(
  "/api/v1/commercial",
  requireAuth,
  async (req, _res, next) => {
    try {
      const row = await pool.query(
        "SELECT global_role FROM users WHERE id=$1 AND active=true",
        [req.user!.id],
      );
      if (!row.rows[0]) fail("Usuário inativo ou removido.", 401);
      if (
        req.user!.role === "superadmin" &&
        row.rows[0].global_role !== "superadmin"
      )
        fail("Privilégio administrativo não confirmado pelo banco.", 403);
      next();
    } catch (e) {
      next(e);
    }
  },
);
const prefix = "/api/v1/commercial";
const id = () => randomUUID();
const money = z.number().finite().min(0).max(999999999).multipleOf(0.01);
const key = z.string().min(16).max(100);
const segmentSchema = z
  .object({
    segmentId: z.enum([
      "assistencia_tecnica",
      "comercio_eletronicos",
      "vestuario_moda",
      "restaurante_gastronomia",
      "varejo_geral",
      "prestador_servicos",
      "personalizado",
    ]),
    segmentName: z.string().max(150),
    showCardRates: z.boolean().optional(),
    showImei: z.boolean(),
    showDevicePassword: z.boolean(),
    showTablesAndKitchen: z.boolean(),
    showCardapioDigital: z.boolean(),
    showTechnicalBench: z.boolean(),
    showSizeColorGrid: z.boolean(),
    updatedAt: z.string().optional(),
  })
  .strict();
const assessmentSchema = z
  .object({
    batteryHealth: z.number().min(0).max(100).nullable(),
    screen: z.enum(["ok", "defect", "unknown"]),
    housing: z.enum(["ok", "defect", "unknown"]),
    cameras: z.enum(["ok", "defect", "unknown"]),
    faceId: z.enum(["ok", "defect", "unknown"]),
    functioning: z.enum(["ok", "defect", "unknown"]),
    originalParts: z.enum(["ok", "defect", "unknown"]),
    repairs: z.enum(["ok", "defect", "unknown"]),
    damage: z.enum(["ok", "defect", "unknown"]),
    notes: z.string().trim().max(2000),
    assessedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const tradeSchema = z
  .object({
    referenceOfferId: z.string().min(1),
    deviceName: z.string().trim().min(1),
    imei: z.string().trim().min(1),
    offerValue: money.refine((v) => v > 0),
    assessment: assessmentSchema,
  })
  .strict();
const orderSchema = z
  .object({
    requestId: key,
    customerId: z.string().min(1),
    offerId: z.string().min(1),
    mode: z.enum(["ready", "order"]),
    stockId: z.string().nullable(),
    qty: z.number().int().min(1).max(100),
    tradeIn: tradeSchema.nullable(),
    notes: z.string().max(2000),
  })
  .strict();

function editor(req: Request, adminOnly = false) {
  if (
    !(
      adminOnly ? ["admin", "superadmin"] : ["admin", "manager", "superadmin"]
    ).includes(req.user!.role || "")
  )
    fail("Operação restrita ao administrador ou gerente da loja.", 403);
}
async function transaction<T>(work: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
async function profile(db: Pick<PoolClient, "query">, storeId: string) {
  const r = await db.query(
    "SELECT settings FROM commercial_profiles WHERE store_id=$1",
    [storeId],
  );
  if (!r.rows[0])
    fail("Ative as regras comerciais no ramo da loja antes de operar.", 409);
  const p = profileSchema.parse(r.rows[0].settings);
  if (!p.enabled) fail("Operação comercial desativada para esta loja.", 403);
  return p;
}
async function offers(
  db: Pick<PoolClient, "query">,
  storeId: string,
): Promise<Offer[]> {
  const r = await db.query(
    "SELECT * FROM commercial_offers WHERE store_id=$1 ORDER BY source_at DESC,created_at DESC",
    [storeId],
  );
  return r.rows.map((o) => ({ ...o.details, id: o.id, active: o.active }));
}
async function related(
  db: Pick<PoolClient, "query">,
  table: "customers" | "suppliers" | "bank_accounts" | "stock_items",
  storeId: string,
  rowId: string,
) {
  const r = await db.query(
    `SELECT * FROM ${table} WHERE id=$1 AND store_id=$2 AND active=true`,
    [rowId, storeId],
  );
  if (!r.rows[0])
    fail("Cadastro ausente, inativo ou pertencente a outra loja.", 404);
  return r.rows[0];
}
async function event(
  db: PoolClient,
  req: Request,
  orderId: string,
  action: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO commercial_order_events(id,store_id,order_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5,$6)",
    [id(), req.storeId, orderId, req.user!.id, action, JSON.stringify(details)],
  );
}
async function lockedOrder(db: PoolClient, req: Request) {
  const r = await db.query(
    "SELECT * FROM commercial_orders WHERE id=$1 AND store_id=$2 FOR UPDATE",
    [req.params.id, req.storeId],
  );
  if (!r.rows[0]) fail("Encomenda não encontrada nesta loja.", 404);
  return r.rows[0];
}
async function paid(db: Pick<PoolClient, "query">, orderId: string) {
  const r = await db.query(
    "SELECT COALESCE(SUM(CASE WHEN kind='payment' THEN amount ELSE -amount END),0) AS total FROM commercial_order_payments WHERE order_id=$1",
    [orderId],
  );
  return Number(r.rows[0].total);
}
async function availableStock(
  db: PoolClient,
  storeId: string,
  stockId: string,
  exceptOrder?: string,
) {
  const r = await db.query(
    "SELECT * FROM stock_items WHERE id=$1 AND store_id=$2 AND active=true FOR UPDATE",
    [stockId, storeId],
  );
  const stock = r.rows[0];
  if (!stock) fail("Produto não encontrado nesta loja.", 404);
  const reserved = await db.query(
    "SELECT COALESCE(SUM((details->>'qty')::int),0) AS qty FROM commercial_orders WHERE store_id=$1 AND details->>'stockId'=$2 AND status IN ('confirmed','purchased','in_transit','received') AND ($3::text IS NULL OR id<>$3)",
    [storeId, stockId, exceptOrder || null],
  );
  return {
    ...stock,
    available_qty: Number(stock.qty) - Number(reserved.rows[0].qty),
  };
}
async function saveDetails(
  db: PoolClient,
  order: any,
  details: any,
  status = order.status,
) {
  await db.query(
    "UPDATE commercial_orders SET details=$1,status=$2,updated_at=now() WHERE id=$3",
    [JSON.stringify(details), status, order.id],
  );
}
async function tradeSnapshot(
  db: PoolClient,
  storeId: string,
  p: CommercialProfile,
  trade: z.infer<typeof tradeSchema>,
) {
  if (!p.tradeIn) fail("Troca de usado desativada nesta loja.", 409);
  const all = await offers(db, storeId),
    base = all.find((o) => o.id === trade.referenceOfferId);
  if (!base || base.condition !== "used")
    fail("Escolha uma referência de aparelho usado equivalente.", 409);
  const reference = selectOffer(all, variantKey(base), p, "reference");
  if (reference.id !== base.id && base.cost !== reference.cost)
    fail("Use o menor custo atual para a referência do usado.", 409);
  if (trade.offerValue >= reference.cost)
    fail("A oferta pelo usado deve ser inferior à referência de mercado.", 409);
  if (Date.parse(trade.assessment.assessedAt) > Date.now())
    fail("A avaliação não pode ter data futura.");
  if (trade.assessment.functioning === "unknown")
    fail("Confirme o funcionamento geral antes de definir a oferta.");
  return { ...trade, reference, referenceCost: reference.cost };
}
async function snapshot(
  db: PoolClient,
  req: Request,
  input: z.infer<typeof orderSchema>,
) {
  const p = await profile(db, req.storeId!),
    all = await offers(db, req.storeId!),
    base = all.find((o) => o.id === input.offerId);
  if (!base || !base.active || !allowedOffer(base, p))
    fail("Oferta não atende ao perfil comercial desta loja.", 409);
  const offer =
    input.mode === "order"
      ? selectOffer(all, variantKey(base), p, "purchase", base.id)
      : base;
  if (input.mode === "ready" && p.appleRules && offer.category !== "iphone")
    fail("Esta categoria é vendida somente sob encomenda.", 409);
  let cost = offer.cost;
  if (input.mode === "ready") {
    if (!input.stockId) fail("Selecione o produto físico para pronta entrega.");
    const stock = await availableStock(db, req.storeId!, input.stockId);
    if (!stockMatches(offer, stock) || stock.available_qty < input.qty)
      fail("Variante divergente ou saldo físico disponível insuficiente.", 409);
    cost = Number(stock.cost);
    if (!(cost > 0)) fail("Informe o custo real do produto recebido.");
  } else if (input.stockId)
    fail("Estoque físico será vinculado no recebimento da encomenda.");
  const tradeIn = input.tradeIn
    ? await tradeSnapshot(db, req.storeId!, p, input.tradeIn)
    : null;
  if (
    tradeIn &&
    (input.qty !== 1 || (p.appleRules && offer.category !== "iphone"))
  )
    fail("Upgrade exige um aparelho por operação.");
  const unitPrice = priceFor(cost, p, input.mode, !!tradeIn),
    total = amount(unitPrice * input.qty),
    netTotal = amount(total - (tradeIn?.offerValue || 0));
  if (netTotal < 0)
    fail("A oferta pelo usado não pode superar o preço vendido.");
  return {
    ...input,
    profile: p,
    offer,
    cost,
    unitPrice,
    total,
    netTotal,
    tradeIn,
    warranty: warrantyFor(offer, p, input.mode),
    tracking: "",
    route: "",
    expectedAt: null,
    stockId: input.stockId,
    receivedAt: null,
  };
}

commercialRouter.get(`${prefix}/state`, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const [p, s, o, c, b, st, ords] = await Promise.all([
      pool.query("SELECT settings FROM commercial_profiles WHERE store_id=$1", [
        storeId,
      ]),
      pool.query(
        "SELECT id,COALESCE(NULLIF(trade_name,''),name) AS name FROM suppliers WHERE store_id=$1 AND active=true ORDER BY 2",
        [storeId],
      ),
      offers(pool, storeId),
      pool.query(
        "SELECT id,name FROM customers WHERE store_id=$1 AND active=true ORDER BY name",
        [storeId],
      ),
      pool.query(
        "SELECT id,name FROM bank_accounts WHERE store_id=$1 AND active=true ORDER BY name",
        [storeId],
      ),
      pool.query(
        "SELECT s.*,s.qty-COALESCE((SELECT SUM((o.details->>'qty')::int) FROM commercial_orders o WHERE o.store_id=s.store_id AND o.details->>'stockId'=s.id AND o.status IN ('confirmed','purchased','in_transit','received')),0) AS available_qty FROM stock_items s WHERE s.store_id=$1 AND s.active=true ORDER BY s.name",
        [storeId],
      ),
      pool.query(
        "SELECT o.*, COALESCE((SELECT SUM(CASE WHEN p.kind='payment' THEN p.amount ELSE -p.amount END) FROM commercial_order_payments p WHERE p.order_id=o.id),0) AS paid_amount FROM commercial_orders o WHERE store_id=$1 ORDER BY created_at DESC LIMIT 500",
        [storeId],
      ),
    ]);
    const store = await pool.query(
      "SELECT trade_name,segment FROM stores WHERE id=$1",
      [storeId],
    );
    res.json({
      success: true,
      data: {
        storeId,
        storeName: store.rows[0].trade_name,
        segmentId: store.rows[0].segment,
        profile: p.rows[0]?.settings || null,
        suppliers: s.rows,
        offers: o,
        customers: c.rows,
        accounts: b.rows,
        stock: st.rows,
        orders: ords.rows,
        canEdit: ["admin", "manager", "superadmin"].includes(
          req.user!.role || "",
        ),
        canConfigure: ["admin", "superadmin"].includes(req.user!.role || ""),
      },
    });
  } catch (e) {
    next(e);
  }
});
commercialRouter.get(`${prefix}/segment`, async (req, res, next) => {
  try {
    const r = await pool.query(
      "SELECT c.settings,s.segment FROM stores s LEFT JOIN commercial_store_customization c ON c.store_id=s.id WHERE s.id=$1",
      [req.storeId],
    );
    res.json({
      success: true,
      data: {
        settings: r.rows[0]?.settings || null,
        segmentId: r.rows[0]?.segment || null,
      },
    });
  } catch (e) {
    next(e);
  }
});
commercialRouter.put(`${prefix}/segment`, async (req, res, next) => {
  try {
    editor(req, true);
    const settings = segmentSchema.parse(req.body);
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO commercial_store_customization(store_id,settings) VALUES($1,$2) ON CONFLICT(store_id) DO UPDATE SET settings=$2,updated_at=now()",
        [req.storeId, JSON.stringify(settings)],
      );
      await db.query(
        "UPDATE stores SET segment=$1,updated_at=now() WHERE id=$2",
        [settings.segmentId, req.storeId],
      );
      try {
        await db.query("SELECT provision_store_attributes($1, $2)", [req.storeId, settings.segmentId]);
      } catch {
        // ignore if function not available
      }
      const r = await db.query(
        "SELECT settings FROM commercial_profiles WHERE store_id=$1 FOR UPDATE",
        [req.storeId],
      );
      if (r.rows[0]) {
        const p = { ...r.rows[0].settings, segmentId: settings.segmentId };
        if (
          ![
            "assistencia_tecnica",
            "comercio_eletronicos",
            "personalizado",
          ].includes(settings.segmentId)
        )
          p.appleRules = false;
        await db.query(
          "UPDATE commercial_profiles SET segment_id=$1,settings=$2,updated_at=now() WHERE store_id=$3",
          [settings.segmentId, JSON.stringify(p), req.storeId],
        );
      }
    });
    res.json({ success: true, data: settings });
  } catch (e) {
    next(e);
  }
});
commercialRouter.put(`${prefix}/profile`, async (req, res, next) => {
  try {
    editor(req, true);
    const p = profileSchema.parse(req.body);
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO commercial_profiles(store_id,segment_id,settings) VALUES($1,$2,$3) ON CONFLICT(store_id) DO UPDATE SET segment_id=$2,settings=$3,updated_at=now()",
        [req.storeId, p.segmentId, JSON.stringify(p)],
      );
      const custom = await db.query(
        "SELECT settings FROM commercial_store_customization WHERE store_id=$1",
        [req.storeId],
      );
      if (custom.rows[0] && custom.rows[0].settings.segmentId !== p.segmentId)
        fail(
          "Salve primeiro o ramo e a personalização da loja para vincular estas regras.",
          409,
        );
      await db.query(
        "UPDATE stores SET segment=$1,updated_at=now() WHERE id=$2",
        [p.segmentId, req.storeId],
      );
    });
    res.json({ success: true, data: p });
  } catch (e) {
    next(e);
  }
});
commercialRouter.post(`${prefix}/offers`, async (req, res, next) => {
  try {
    editor(req);
    const inputs = z.array(offerSchema).min(1).max(500).parse(req.body);
    const result = await transaction(async (db) => {
      await profile(db, req.storeId!);
      const result: string[] = [];
      for (const input of inputs) {
        await related(db, "suppliers", req.storeId!, input.supplierId);
        if (Date.parse(input.sourceAt) > Date.now())
          fail("Atualização da oferta não pode ser futura.");
        const rowId = id();
        await db.query(
          "INSERT INTO commercial_offers(id,store_id,supplier_id,variant_key,details,source_at,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            rowId,
            req.storeId,
            input.supplierId,
            variantKey(input),
            JSON.stringify(input),
            input.sourceAt,
            input.validUntil,
          ],
        );
        result.push(rowId);
      }
      return result;
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});
commercialRouter.delete(`${prefix}/offers/:id`, async (req, res, next) => {
  try {
    editor(req);
    const result = await pool.query(
      "UPDATE commercial_offers SET active=false WHERE id=$1 AND store_id=$2 RETURNING id",
      [req.params.id, req.storeId],
    );
    if (!result.rows[0]) fail("Oferta não encontrada nesta loja.", 404);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) {
    next(e);
  }
});
commercialRouter.get(`${prefix}/catalog`, async (req, res, next) => {
  try {
    const p = await profile(pool, req.storeId!);
    if (!p.catalog) fail("Tabela comercial desativada nesta loja.", 403);
    const all = await offers(pool, req.storeId!);
    const stocks = await pool.query(
      "SELECT s.*,s.qty-COALESCE((SELECT SUM((details->>'qty')::int) FROM commercial_orders WHERE store_id=s.store_id AND details->>'stockId'=s.id AND status IN ('confirmed','purchased','in_transit','received')),0) AS available_qty FROM stock_items s WHERE s.store_id=$1 AND s.active=true",
      [req.storeId],
    );
    const st = await pool.query("SELECT trade_name FROM stores WHERE id=$1", [
      req.storeId,
    ]);
    res.json({
      success: true,
      data: catalogText(st.rows[0].trade_name, all, stocks.rows, p),
    });
  } catch (e) {
    next(e);
  }
});
commercialRouter.post(`${prefix}/orders`, async (req, res, next) => {
  try {
    editor(req);
    const input = orderSchema.parse(req.body);
    const row = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        req.storeId + ":commercial:" + input.requestId,
      ]);
      const exists = await db.query(
        "SELECT * FROM commercial_orders WHERE store_id=$1 AND request_key=$2",
        [req.storeId, input.requestId],
      );
      if (exists.rows[0]) {
        const saved = exists.rows[0];
        const fields = [
          "customerId",
          "offerId",
          "mode",
          "stockId",
          "qty",
          "notes",
        ];
        if (
          fields.some(
            (k) =>
              JSON.stringify(saved.details[k]) !==
              JSON.stringify((input as any)[k]),
          ) ||
          JSON.stringify(
            saved.details.tradeIn
              ? tradeSchema.parse(
                  saved.details.tradeIn && {
                    referenceOfferId: saved.details.tradeIn.referenceOfferId,
                    deviceName: saved.details.tradeIn.deviceName,
                    imei: saved.details.tradeIn.imei,
                    offerValue: saved.details.tradeIn.offerValue,
                    assessment: saved.details.tradeIn.assessment,
                  },
                )
              : null,
          ) !== JSON.stringify(input.tradeIn)
        )
          fail("Chave de proposta já utilizada para outra operação.", 409);
        return saved;
      }
      await related(db, "customers", req.storeId!, input.customerId);
      const details = await snapshot(db, req, input),
        rowId = id();
      const r = await db.query(
        "INSERT INTO commercial_orders(id,store_id,customer_id,details,request_key) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          rowId,
          req.storeId,
          input.customerId,
          JSON.stringify(details),
          input.requestId,
        ],
      );
      await event(db, req, rowId, "quoted");
      return r.rows[0];
    });
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});
commercialRouter.put(`${prefix}/orders/:id`, async (req, res, next) => {
  try {
    editor(req);
    const input = orderSchema.parse(req.body);
    const row = await transaction(async (db) => {
      const order = await lockedOrder(db, req);
      if (order.status !== "quoted")
        fail(
          "Somente propostas podem ter preços, cliente e itens editados.",
          409,
        );
      await related(db, "customers", req.storeId!, input.customerId);
      const details = await snapshot(db, req, input);
      await db.query(
        "UPDATE commercial_orders SET details=$1,customer_id=$2,updated_at=now() WHERE id=$3",
        [JSON.stringify(details), input.customerId, order.id],
      );
      await event(db, req, order.id, "edited");
      return { ...order, details, customer_id: input.customerId };
    });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});
commercialRouter.get(`${prefix}/orders/:id`, async (req, res, next) => {
  try {
    const order = await pool.query(
      "SELECT * FROM commercial_orders WHERE id=$1 AND store_id=$2",
      [req.params.id, req.storeId],
    );
    if (!order.rows[0]) fail("Encomenda não encontrada nesta loja.", 404);
    const events = await pool.query(
      "SELECT * FROM commercial_order_events WHERE order_id=$1 AND store_id=$2 ORDER BY created_at",
      [req.params.id, req.storeId],
    );
    const payments = await pool.query(
      "SELECT * FROM commercial_order_payments WHERE order_id=$1 AND store_id=$2 ORDER BY created_at",
      [req.params.id, req.storeId],
    );
    res.json({
      success: true,
      data: { ...order.rows[0], events: events.rows, payments: payments.rows },
    });
  } catch (e) {
    next(e);
  }
});
commercialRouter.post(
  `${prefix}/orders/:id/payments`,
  async (req, res, next) => {
    try {
      editor(req);
      const input = z
        .object({
          requestId: key,
          amount: money.refine((v) => v > 0),
          accountId: z.string().min(1),
          method: z.string().trim().min(1).max(100),
          kind: z.enum(["payment", "refund"]),
        })
        .strict()
        .parse(req.body);
      const result = await transaction(async (db) => {
        const order = await lockedOrder(db, req),
          d = order.details;
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          req.storeId + ":payment:" + input.requestId,
        ]);
        const prev = await db.query(
          "SELECT * FROM commercial_order_payments WHERE store_id=$1 AND request_key=$2",
          [req.storeId, input.requestId],
        );
        if (prev.rows[0]) {
          if (
            prev.rows[0].order_id !== order.id ||
            Number(prev.rows[0].amount) !== input.amount ||
            prev.rows[0].kind !== input.kind ||
            prev.rows[0].account_id !== input.accountId ||
            prev.rows[0].method !== input.method
          )
            fail("Chave de pagamento já utilizada para outra operação.", 409);
          return prev.rows[0];
        }
        if (
          order.status === "quoted" ||
          order.status === "delivered" ||
          (order.status === "cancelled" && input.kind === "payment")
        )
          fail("Pagamento não permitido neste estado.", 409);
        await related(db, "bank_accounts", req.storeId!, input.accountId);
        const total = await paid(db, order.id);
        if (
          input.kind === "payment" &&
          amount(total + input.amount) > d.netTotal
        )
          fail("Pagamento supera a diferença devida.", 409);
        if (input.kind === "refund" && input.amount > total)
          fail("Devolução supera o valor recebido.", 409);
        const financeId = id(),
          payId = id();
        await db.query(
          "INSERT INTO finance_entries(id,store_id,type,label,amount,source,ref_id,account_id,operator_name) VALUES($1,$2,$3,$4,$5,'manual',$6,$7,$8)",
          [
            financeId,
            req.storeId,
            input.kind === "payment" ? "in" : "out",
            `Encomenda ${order.id}: ${input.kind}`,
            input.amount,
            order.id,
            input.accountId,
            req.user!.name,
          ],
        );
        await db.query(
          "UPDATE bank_accounts SET current_balance=current_balance+$1,updated_at=now() WHERE id=$2 AND store_id=$3",
          [
            input.kind === "payment" ? input.amount : -input.amount,
            input.accountId,
            req.storeId,
          ],
        );
        const r = await db.query(
          "INSERT INTO commercial_order_payments(id,order_id,store_id,account_id,kind,amount,method,request_key,finance_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            payId,
            order.id,
            req.storeId,
            input.accountId,
            input.kind,
            input.amount,
            input.method,
            input.requestId,
            financeId,
          ],
        );
        const newPaid = amount(
          total + (input.kind === "payment" ? input.amount : -input.amount),
        );
        if (order.receivable_id)
          await db.query(
            "UPDATE receivables SET received_amount=$1,status=$2::bill_status,received_at=CASE WHEN $2::bill_status='paid' THEN now() ELSE NULL END,updated_at=now() WHERE id=$3 AND store_id=$4",
            [
              newPaid,
              order.status === "cancelled"
                ? "cancelled"
                : newPaid >= d.netTotal
                  ? "paid"
                  : newPaid > 0
                    ? "partial"
                    : "open",
              order.receivable_id,
              req.storeId,
            ],
          );
        await event(db, req, order.id, input.kind, {
          amount: input.amount,
          accountId: input.accountId,
        });
        return r.rows[0];
      });
      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  },
);
commercialRouter.post(
  `${prefix}/orders/:id/reassess`,
  async (req, res, next) => {
    try {
      editor(req);
      const trade = tradeSchema.parse(req.body);
      const result = await transaction(async (db) => {
        const order = await lockedOrder(db, req),
          d = order.details;
        if (
          !d.tradeIn ||
          !["confirmed", "purchased", "in_transit", "received"].includes(
            order.status,
          )
        )
          fail("Encomenda não permite reavaliação neste estado.", 409);
        if (trade.imei !== d.tradeIn.imei)
          fail("A reavaliação deve corresponder ao mesmo aparelho.", 409);
        const evaluated = await tradeSnapshot(
          db,
          req.storeId!,
          profileSchema.parse(d.profile),
          trade,
        );
        if (variantKey(evaluated.reference) !== variantKey(d.tradeIn.reference))
          fail(
            "A referência deve corresponder à mesma variante do usado.",
            409,
          );
        const next = {
          ...d,
          tradeIn: evaluated,
          netTotal: amount(d.total - evaluated.offerValue),
        };
        if (next.netTotal < 0) fail("Oferta superior ao preço vendido.");
        await saveDetails(db, order, next);
        const total = await paid(db, order.id);
        await db.query(
          "UPDATE receivables SET amount=$1,status=$2,updated_at=now() WHERE id=$3 AND store_id=$4",
          [
            next.netTotal,
            total >= next.netTotal ? "paid" : total > 0 ? "partial" : "open",
            order.receivable_id,
            req.storeId,
          ],
        );
        await event(db, req, order.id, "reassessed", {
          previous: d.tradeIn,
          current: evaluated,
        });
        return next;
      });
      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  },
);

commercialRouter.post(
  `${prefix}/orders/:id/transition`,
  async (req, res, next) => {
    try {
      editor(req);
      const input = z
        .object({
          status: z.enum([
            "confirmed",
            "purchased",
            "in_transit",
            "received",
            "delivered",
            "cancelled",
          ]),
          expectedAt: z
            .string()
            .datetime({ offset: true })
            .nullable()
            .optional(),
          route: z.string().max(200).optional(),
          tracking: z.string().max(300).optional(),
          physicalReceiptConfirmed: z.boolean().optional(),
          sameConditionConfirmed: z.boolean().optional(),
          dataTransferConfirmed: z.boolean().optional(),
          deliveredImei: z.string().max(100).optional(),
          notes: z.string().max(2000).optional(),
        })
        .strict()
        .parse(req.body);
      const result = await transaction(async (db) => {
        const order = await lockedOrder(db, req);
        let d = order.details;
        if (order.status === input.status) return order;
        if (
          order.status === "cancelled" ||
          (order.status === "delivered" && input.status !== "cancelled")
        )
          fail("Encomenda já encerrada.", 409);
        const next: Record<string, string[]> = {
          quoted: ["confirmed", "cancelled"],
          confirmed:
            d.mode === "ready"
              ? ["delivered", "cancelled"]
              : ["purchased", "cancelled"],
          purchased: ["in_transit", "received", "cancelled"],
          in_transit: ["received", "cancelled"],
          received: ["delivered", "cancelled"],
          delivered: ["cancelled"],
        };
        if (!next[order.status].includes(input.status))
          fail("Transição inválida para esta encomenda.", 409);
        if (input.status === "confirmed") {
          const p = await profile(db, req.storeId!);
          const all = await offers(db, req.storeId!);
          if (d.mode === "order") {
            const latest = selectOffer(
              all,
              variantKey(d.offer),
              p,
              "purchase",
              d.offer.id,
            );
            if (latest.cost !== d.offer.cost)
              fail("Oferta alterada. Revise a proposta.", 409);
          } else {
            const s = await availableStock(
              db,
              req.storeId!,
              d.stockId,
              order.id,
            );
            if (s.available_qty < d.qty)
              fail("Saldo físico reservado por outra encomenda.", 409);
          }
          const customer = await related(
              db,
              "customers",
              req.storeId!,
              order.customer_id,
            ),
            rec = id();
          await db.query(
            "INSERT INTO receivables(id,store_id,description,customer_id,customer_name,amount,due_date,notes,category) VALUES($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,'Encomendas')",
            [
              rec,
              req.storeId,
              `Encomenda ${order.id}`,
              customer.id,
              customer.name,
              d.netTotal,
              `Encomenda ${order.id}`,
            ],
          );
          await db.query(
            "UPDATE commercial_orders SET receivable_id=$1 WHERE id=$2",
            [rec, order.id],
          );
        }
        if (input.status === "purchased") {
          if (amount(await paid(db, order.id)) !== d.netTotal)
            fail(
              "Confirme o pagamento antecipado integral da diferença antes da compra.",
              409,
            );
          if (!input.expectedAt || !input.route)
            fail("Informe previsão de recebimento confirmada e rota.");
          const supplier = await related(
              db,
              "suppliers",
              req.storeId!,
              d.offer.supplierId,
            ),
            payableId = id();
          await db.query(
            "INSERT INTO payables(id,store_id,description,supplier_id,supplier_name,amount,due_date,notes,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Compra de mercadorias')",
            [
              payableId,
              req.storeId,
              `Compra para encomenda ${order.id}`,
              supplier.id,
              supplier.name,
              amount(d.cost * d.qty),
              input.expectedAt.slice(0, 10),
              input.notes || "",
            ],
          );
          await db.query(
            "UPDATE commercial_orders SET payable_id=$1 WHERE id=$2",
            [payableId, order.id],
          );
          d = { ...d, expectedAt: input.expectedAt, route: input.route };
        }
        if (input.status === "in_transit") {
          if (!input.tracking)
            fail("Informe rastreio ou referência do transporte.");
          d = {
            ...d,
            tracking: input.tracking,
            expectedAt: input.expectedAt || d.expectedAt,
          };
        }
        if (input.status === "received") {
          if (!input.physicalReceiptConfirmed)
            fail("Confirme a conferência física antes de receber.");
          const stockId = id(),
            o = d.offer;
          await db.query(
            "INSERT INTO stock_items(id,store_id,name,sku,qty,min_qty,cost,price,kind,condition,category,brand,color,capacity,attrs,supplier_id,imei) VALUES($1,$2,$3,$4,$5,0,$6,$7,'device',$8,$9,$10,$11,$12,$13,$14,$15)",
            [
              stockId,
              req.storeId,
              o.model,
              `ENC-${order.id}`,
              d.qty,
              d.cost,
              priceFor(d.cost, d.profile, "ready", false),
              o.condition === "used"
                ? "used"
                : o.condition === "refurbished"
                  ? "refurbished"
                  : "new",
              o.category,
              o.brand,
              o.color,
              o.capacity,
              JSON.stringify({
                configuration: o.configuration,
                commercialOrderId: order.id,
                sealed: o.condition === "sealed",
                commercialCondition: o.condition,
              }),
              o.supplierId,
              input.deliveredImei || "",
            ],
          );
          await db.query(
            "INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name,notes) VALUES($1,$2,$3,'in',$4,0,$4,$5,'commercial_receipt',$6,$7,$8)",
            [
              id(),
              req.storeId,
              stockId,
              d.qty,
              d.cost,
              order.id,
              req.user!.name,
              input.notes || "Recebimento conferido",
            ],
          );
          d = { ...d, stockId, receivedAt: new Date().toISOString() };
        }
        if (input.status === "delivered") {
          if (amount(await paid(db, order.id)) !== d.netTotal)
            fail(
              "Quite ou devolva a diferença financeira antes da entrega.",
              409,
            );
          if (
            d.tradeIn &&
            (!input.sameConditionConfirmed || !input.dataTransferConfirmed)
          )
            fail(
              "Confirme reavaliação e transferência dos dados antes de receber o usado.",
              409,
            );
          const stock = await availableStock(
            db,
            req.storeId!,
            d.stockId,
            order.id,
          );
          if (stock.available_qty < d.qty)
            fail("Estoque insuficiente para entregar.", 409);
          const customer = await related(
              db,
              "customers",
              req.storeId!,
              order.customer_id,
            ),
            saleId = id();
          await db.query(
            "INSERT INTO sales_orders(id,local_id,store_id,customer_id,customer_name,customer_phone,customer_document,total,final_amount,total_amount,subtotal,source,sale_type,status,cost_total,gross_profit,margin_percent,trade_in_value,warranty_terms,warranty_months,notes,operator_name,seller_name,payment_name,product_name) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$8,$7,'commercial','external','sold',$9,$10,$11,$12,$13,$14,$15,$16,$16,'Antecipação de encomenda',$17)",
            [
              saleId,
              req.storeId,
              customer.id,
              customer.name,
              customer.phone || "",
              customer.document || "",
              d.total,
              d.netTotal,
              amount(d.cost * d.qty),
              amount(d.total - d.cost * d.qty),
              d.total > 0
                ? amount(((d.total - d.cost * d.qty) / d.total) * 100)
                : 0,
              d.tradeIn?.offerValue || 0,
              d.warranty.text,
              d.warranty.months,
              d.notes,
              req.user!.name,
              d.offer.model,
            ],
          );
          await db.query(
            "INSERT INTO sales_order_lines(id,sale_id,order_id,stock_item_id,stock_id,name,qty,unit_price,total_price,unit_cost,total_cost,imei) VALUES($1,$2,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)",
            [
              id(),
              saleId,
              stock.id,
              stock.name,
              d.qty,
              d.unitPrice,
              d.total,
              d.cost,
              amount(d.cost * d.qty),
              stock.imei || input.deliveredImei || "",
            ],
          );
          await db.query(
            "UPDATE stock_items SET qty=qty-$1,updated_at=now() WHERE id=$2 AND store_id=$3",
            [d.qty, stock.id, req.storeId],
          );
          await markUnitsSold(db, { storeId: req.storeId!, stockId: stock.id, variationId: null, qty: d.qty, imei: stock.imei || input.deliveredImei || "", saleId, unitPrice: d.unitPrice, operator: req.user!.name });
          await db.query(
            "INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name) VALUES($1,$2,$3,'sale',$4,$5,$6,$7,'commercial_delivery',$8,$9)",
            [
              id(),
              req.storeId,
              stock.id,
              d.qty,
              stock.qty,
              Number(stock.qty) - d.qty,
              d.cost,
              order.id,
              req.user!.name,
            ],
          );
          if (d.tradeIn) {
            const t = d.tradeIn,
              usedId = id(),
              reference = t.reference;
            await db.query(
              "INSERT INTO stock_items(id,store_id,name,sku,imei,qty,min_qty,cost,price,kind,condition,brand,category,color,capacity,attrs) VALUES($1,$2,$3,$4,$5,1,0,$6,0,'device','used',$7,$8,$9,$10,$11)",
              [
                usedId,
                req.storeId,
                reference.model,
                `TI-${order.id}`,
                t.imei,
                t.offerValue,
                reference.brand,
                reference.category,
                reference.color,
                reference.capacity,
                JSON.stringify({
                  configuration: reference.configuration,
                  assessment: t.assessment,
                  commercialOrderId: order.id,
                }),
              ],
            );
            await db.query(
              "INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name) VALUES($1,$2,$3,'in',1,0,1,$4,'trade_in',$5,$6)",
              [id(), req.storeId, usedId, t.offerValue, saleId, req.user!.name],
            );
            await db.query(
              "INSERT INTO sale_trade_ins(id,sale_id,store_id,device_name,imei,capacity,color,condition_state,notes,trade_value,stock_item_id,status,customer_id) VALUES($1,$2,$3,$4,$5,$6,$7,'used',$8,$9,$10,'received',$11)",
              [
                id(),
                saleId,
                req.storeId,
                t.deviceName,
                t.imei,
                reference.capacity,
                reference.color,
                JSON.stringify(t.assessment),
                t.offerValue,
                usedId,
                customer.id,
              ],
            );
            d = { ...d, usedStockId: usedId };
          }
          await db.query(
            "INSERT INTO sale_payments(id,sale_id,method,method_name,type,amount,installments) VALUES($1,$2,'Antecipação de encomenda','Antecipação de encomenda','other',$3,1)",
            [id(), saleId, d.netTotal],
          );
          await db.query(
            "UPDATE commercial_orders SET sale_id=$1 WHERE id=$2",
            [saleId, order.id],
          );
          await db.query(
            "UPDATE receivables SET sale_id=$1 WHERE id=$2 AND store_id=$3",
            [saleId, order.receivable_id, req.storeId],
          );
          d = { ...d, saleId };
        }
        if (input.status === "cancelled") {
          if (!input.notes?.trim()) fail("Informe o motivo do cancelamento.");
          if (order.status === "delivered") {
            if (!input.physicalReceiptConfirmed)
              fail("Confirme a devolução física do produto vendido.");
            if (d.usedStockId) {
              const used = await availableStock(
                db,
                req.storeId!,
                d.usedStockId,
              );
              if (Number(used.qty) !== 1 || used.available_qty !== 1)
                fail(
                  "Usado já movimentado ou reservado. Confira a operação antes do estorno.",
                  409,
                );
              await db.query(
                "UPDATE stock_items SET qty=0,active=false,updated_at=now() WHERE id=$1 AND store_id=$2",
                [used.id, req.storeId],
              );
              await db.query(
                "INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name) VALUES($1,$2,$3,'out',1,1,0,$4,'trade_in_reversal',$5,$6)",
                [
                  id(),
                  req.storeId,
                  used.id,
                  d.tradeIn.offerValue,
                  order.id,
                  req.user!.name,
                ],
              );
              await db.query(
                "UPDATE sale_trade_ins SET status='cancelled',updated_at=now() WHERE sale_id=$1 AND store_id=$2",
                [order.sale_id, req.storeId],
              );
            }
            const stock = await availableStock(db, req.storeId!, d.stockId);
            await db.query(
              "UPDATE stock_items SET qty=qty+$1,updated_at=now() WHERE id=$2 AND store_id=$3",
              [d.qty, stock.id, req.storeId],
            );
            await db.query(
              "INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name) VALUES($1,$2,$3,'in',$4,$5,$6,$7,'commercial_reversal',$8,$9)",
              [
                id(),
                req.storeId,
                stock.id,
                d.qty,
                stock.qty,
                Number(stock.qty) + d.qty,
                d.cost,
                order.id,
                req.user!.name,
              ],
            );
            await db.query(
              "UPDATE sales_orders SET status='cancelled',updated_at=now() WHERE id=$1 AND store_id=$2",
              [order.sale_id, req.storeId],
            );
            await unmarkSaleUnits(db, req.storeId!, order.sale_id, req.user!.name);
          }
          if (order.receivable_id)
            await db.query(
              "UPDATE receivables SET status='cancelled',updated_at=now() WHERE id=$1 AND store_id=$2",
              [order.receivable_id, req.storeId],
            );
          d = { ...d, cancelReason: input.notes }; // Money is refunded explicitly; purchased supplier liabilities are not erased.
        }
        await saveDetails(db, order, d, input.status);
        await event(db, req, order.id, input.status, {
          notes: input.notes,
          expectedAt: d.expectedAt,
          route: d.route,
          tracking: d.tracking,
        });
        return { ...order, status: input.status, details: d };
      });
      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  },
);
