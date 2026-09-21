# Prompt para o Marthi-Backend (Nest + Prisma)

Cole este arquivo no chat do repositório **Marthi-Backend**.  
Fonte de verdade do contrato de campos: `docs/database.md` do front (repo Marthi Frontend / Marthi-Tec).  
Wiring front ↔ Nest: `docs/specs/backend-nest-wiring.md`.

---

## Contexto

O frontend público está em `https://marthi-totem.discloud.app`.  
A API Nest deve ficar em `https://marthi-backend.discloud.app`.

| Superfície | Quem atende hoje | Quem deve atender |
|---|---|---|
| `/health`, auth, partners, products | Nest (alvo) | **Nest — implementar agora** |
| Totem leads, POS tickets | Express no Site totem | Nest depois (fase 3) |
| Clientes, estoque, OS, financeiro, tabelas, pagamentos, atributos | `localStorage` no browser | Nest + Prisma (fase 2) |

Envelope obrigatório em **todas** as respostas JSON:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} }
}
```

Códigos: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`.

Prefixo de rotas: `API_PREFIX=api/v1` → paths `/api/v1/...`.  
Porta: `8080`. CORS: `https://marthi-totem.discloud.app` e `http://localhost:5173`.

---

## Objetivo deste passo

Não implementar o ERP inteiro de uma vez.  
**Agora:** destravar o front que já aponta auth/partners/health/products para o Nest.  
**Depois:** Prisma completo do painel (usar `docs/database.md`).

---

## Passo a passo — FASE 1 (fazer agora)

### 1. Ambiente e Prisma base

1. Confirmar `DATABASE_URL` com `?schema=public`.
2. Criar/ajustar models mínimos no Prisma:
   - `Store` (seed 1 loja: Cell Ponto / “Sua Loja”)
   - `User` (`id` TEXT, `email` unique, `name`, `picture`, `provider` google|password, `passwordHash?`, `googleSub?`, `storeId`)
   - `PartnerSignup` (todos os campos do signup — ver abaixo)
   - `Brand`, `Product`, `ProductImage` (catálogo mínimo para o totem)
3. `prisma migrate` + `prisma seed`:
   - 1 store
   - 1 user `teste@marthi.com.br` / senha hash de `123` (compatível com `AUTH_DEV_*`)
   - produtos seed alinhados ao totem (iPhone 16 Pro Max, 16 Pro, 15, 14, 13, 12, 11, Redmi Note 13 Pro) — ver `apps/web/src/pages/totem/totemData.ts` no front
4. Env obrigatórias:

```text
DATABASE_URL=postgresql://…/MarthiDB?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=7d
AUTH_DEV_EMAIL=teste@marthi.com.br
AUTH_DEV_PASSWORD=123
GOOGLE_CLIENT_ID=...   # opcional no início
CORS_ORIGINS=https://marthi-totem.discloud.app,http://localhost:5173
PORT=8080
API_PREFIX=api/v1
SWAGGER_ENABLED=true
NODE_ENV=production
```

### 2. `GET /health`

Resposta `data`:

```ts
{
  service: string;
  status: 'ok' | 'degraded';
  time: string; // ISO
  database: {
    configured: boolean;
    connected: boolean;
    error: string | null;
  };
}
```

Aceite: `database.connected: true` com Postgres up.

### 3. Auth (público + JWT)

| Método | Path | Body | Resposta `data` |
|---|---|---|---|
| GET | `/api/v1/auth/providers` | — | `{ google, password, googleClientId }` |
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ token, user }` |
| POST | `/api/v1/auth/google` | `{ idToken }` | `{ token, user }` |
| GET | `/api/v1/auth/me` | Header `Authorization: Bearer <token>` | `{ user }` |

`user`:

```ts
{
  id: string;          // password:<email> ou google:<sub> (ou UUID — se mudar, alinhar com o front)
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
}
```

Regras:

- JWT HS256, expiração `JWT_EXPIRES_IN` (default 7d).
- Login com `AUTH_DEV_EMAIL` / `AUTH_DEV_PASSWORD` **deve funcionar** (o painel usa `teste@marthi.com.br` / `123`).
- Google: só se `GOOGLE_CLIENT_ID` estiver setado; senão `501` ou `google: false` em providers.
- Habilitar CORS nas rotas.

### 4. Partners (público)

`POST /api/v1/partners/signup`

Body (validar igual ao front):

```ts
{
  planId: 'start' | 'growth' | 'scale';
  modules: Array<'totem' | 'presales' | 'os' | 'erp'>; // unique, min 1
  documentType: 'cnpj' | 'cpf';
  document: string;       // 11–18
  legalName: string;      // 2–180
  tradeName: string;      // 2–180
  email: string;
  phone: string;          // 8–20
  zipCode: string;        // 8–9
  street: string;
  number: string;
  complement?: string;    // default ''
  district: string;
  city: string;
  state: string;          // UF 2 chars
  segment?: string;
  contactName: string;
  contactRole?: string;
  notes?: string;
}
```

Regras de plano:

- Start → exatamente 1 módulo  
- Growth → 1 ou 2 módulos  
- Scale → os 4 módulos obrigatórios  

Resposta `201`: `{ id: string, message: string }`  
`id` com prefixo `PRT-…` (o front espera string).

Persistir no Postgres (não array em memória).

Opcional nesta fase: `GET /api/v1/partners/signup/pending` **com auth** listando últimos cadastros.

### 5. Products (autenticado)

`GET /api/v1/products` — **Bearer obrigatório**, **não** retornar 501.

Shape mínimo alinhado a `packages/shared`:

```ts
{
  id: number | string;
  name: string;
  brandId: number | string | null;
  status: 'active' | 'inactive';
  reference: string | null;
  createdAt: string;
  updatedAt: string | null;
}
```

Ideal já devolver também (mesmo que em endpoints separados):

- `GET /api/v1/products/:id/variants`
- `GET /api/v1/products/:id/images`

Seed deve cobrir o catálogo do totem Cell Ponto.

### 6. Aceite Fase 1

- [ ] `GET https://marthi-backend.discloud.app/health` → `database.connected: true`
- [ ] Login painel com `teste@marthi.com.br` / `123` via Nest
- [ ] `GET /api/v1/products` com Bearer retorna lista (não 501)
- [ ] `POST /api/v1/partners/signup` grava no banco e devolve `id`
- [ ] CORS ok a partir de `marthi-totem.discloud.app`
- [ ] Totem lead **continua** funcionando no domínio totem (Express) — não quebrar

---

## FASE 2 — Prisma do painel (depois da Fase 1)

Usar o dicionário completo em `docs/database.md` do front.  
Criar models/enums e CRUD. IDs públicos com prefixos:

`CLI-` `STK-` `PED-` `FIN-` `TAB-` `PAY-` `OS-` `OL-` `PDV-` `ATTR-` `PRT-` `REC-`

### Enums Prisma

```
plan_id: start | growth | scale
module_id: totem | presales | os | erp
document_type: cnpj | cpf
auth_provider: google | password
product_status: active | inactive
stock_kind: part | device | supply
stock_condition: new | used | refurbished
payment_type: cash | pix | debit | credit | other
ticket_source: totem | manual
ticket_status: open | sold | cancelled
finance_type: in | out
finance_source: manual | pos | os_part | os_purchase | os_revenue | os_reversal
os_status: open | diagnosis | waiting | progress | ready | delivered | cancelled
os_priority: low | normal | high
asset_disposition: customer | purchased | scrapped
os_line_kind: part | labor
totem_mode: kiosk | catalog
```

### Tabelas / endpoints a implementar (ordem)

1. `customers` — CRUD  
2. `product_attributes` + values — CRUD (máx 5; seed ATTR-COR, ATTR-CAP, ATTR-RET)  
3. `stock_items` + attrs — CRUD + `GET /stock/lookup?code=`  
4. `price_tables` — CRUD  
5. `payment_methods` — CRUD (FK price_table)  
6. `finance_entries` — list + create manual  
7. `POST /pos/sales` — **transação**: linhas + desconto/acréscimo + baixa estoque + finance `pos` + upsert cliente por telefone  
8. `work_orders` + lines + eventos ledger (ver abaixo)  
9. `store_entitlements`, `totem_settings`, `operator_profiles`

### Campos que a UI usa no close de venda e o pedido antigo não gravava

Persistir de verdade:

- `sales_orders`: `customerPhone`, `customerId?`, `discount`, `surcharge`, `paymentMethodId?`, `priceTableId?`
- `sales_order_lines`: `stockId?`, `name`, `qty`, `unitPrice`, `imei`

`amount = max(0, Σ(unitPrice*qty) − discount + surcharge)`

### Ledger OS (transacional — ADR oficina)

| Evento | Endpoint sugerido | Estoque | Financeiro |
|---|---|---|---|
| Consumir peça | `POST /work-orders/:id/parts` | qty − | out `os_part` |
| Estornar peça | `DELETE /work-orders/:id/parts/:lineId` | qty + | in `os_reversal` |
| Comprar recondicionado | `POST /work-orders/:id/purchase` | +1 refurbished | out `os_purchase` |
| Entregar | `POST /work-orders/:id/deliver` | — | in `os_revenue` |
| Cancelar | `POST /work-orders/:id/cancel` | estorna | reversões |

Body purchase: `{ cost, price?, sku?, imei?, name? }`  
`price` default `round(cost * 1.35, 2)`.

Não persistir derivados: saldo financeiro, preço com %, `WorkOrder.parts` se há linhas, `installmentLabel`.

---

## FASE 3 — migrar totem/PDV para Nest

Só depois da Fase 1 estável:

1. `POST /api/v1/totem/leads` — body igual ao Express **+** `attributes?: { id, name, value }[]` (o front já envia; o Express antigo ignorava)
2. Criar `pos_tickets` no Prisma
3. `GET /api/v1/pos/tickets` → `{ open, items }`
4. `PATCH /api/v1/pos/tickets/:id` → `{ status: 'open'|'sold'|'cancelled' }`
5. Avisar o front para trocar `edgeApiUrl()` → Nest nesses clients
6. Integração WhatsApp/Evolution pode continuar no edge ou migrar depois

---

## O que NÃO fazer agora

- Não reescrever o front.
- Não migrar totum/PDV antes de auth/products/partners estarem no ar.
- Não inventar campos fora de `docs/database.md`.
- Não usar `Int` autoincrement como único id público se quebrar os prefixos da UI — preferir `String @id`.
- Não deixar `GET /partners/signup/pending` público sem auth.

---

## Referências no repo do Frontend

Leia / peça cópia destes arquivos se precisar de campos exatos:

1. `docs/database.md` — dicionário + DDL  
2. `docs/specs/backend-nest-wiring.md` — hosts e aceite  
3. `docs/specs/workshop-stock-finance.md` — regras OS  
4. `packages/shared/src/index.ts` — `ApiResponse`, `Product`, `ProductVariant`  
5. `apps/web/src/services/{auth,partners,api,config}.ts` — o que o front chama no Nest  
6. `apps/web/src/pages/totem/totemData.ts` — seed do catálogo  

---

## Ordem de commits sugerida

1. `feat: health + prisma store/user seed`  
2. `feat: auth jwt login google me providers`  
3. `feat: partners signup persist`  
4. `feat: products list authenticated + seed catalog`  
5. (depois) `feat: customers stock attributes price tables payments`  
6. (depois) `feat: pos sales transaction`  
7. (depois) `feat: work orders ledger`  
8. (depois) `feat: migrate totem leads and pos tickets`

---

## Resposta esperada do agente do backend

Ao receber este prompt, o agente deve:

1. Confirmar o que já existe no Marthi-Backend.  
2. Implementar **somente a Fase 1** se ainda não estiver pronta.  
3. Gerar/atualizar `schema.prisma` + migration + seed.  
4. Listar endpoints prontos vs pendentes.  
5. Só então propor o plano detalhado da Fase 2 com base em `docs/database.md`.
