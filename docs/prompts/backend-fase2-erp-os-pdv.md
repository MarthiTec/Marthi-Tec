# Prompt — Fase 2 Nest (ERP + OS + PDV + Financeiro)

Cole este arquivo no chat do repositório **Marthi-Backend** (`E:\Projetos\Marthi\Backend` / GitHub MarthiTec/Marthi-Backend).

**Front de referência:** repo Frontend (`apps/web/src/data/*`).  
**Fase 1 (já pronta):** `/health`, auth JWT, partners signup, products (públicos).  
**Host:** `https://marthi-backend.discloud.app` · front `https://marthi-totem.discloud.app` · CORS inclui `http://localhost:5173` e `http://127.0.0.1:5173`.

---

## 0. Objetivo da Fase 2

Tirar do `localStorage` e persistir no Postgres (Prisma) + expor REST autenticado para o painel:

1. Clientes  
2. Atributos de produto  
3. Estoque (SKU)  
4. Tabelas de preço + formas de pagamento  
5. Financeiro (lançamentos)  
6. Venda PDV transacional (`POST /pos/sales`)  
7. Ordens de serviço + ledger (consumir peça, comprar recondicionado, entregar, cancelar)  
8. Plano da loja + settings totem + perfil operador (pequenos, mas usados no painel)

**Fora desta fase (não implementar agora):**

- Caixa/sangria (`cashRegisterStore`)  
- Emissor fiscal / NF-e (`fiscal*`)  
- E-commerce marketplaces  
- CRM kanban  
- Migrar totem leads / POS tickets do Express (fica **Fase 3**)  
- Multi-tenant real (continuar 1 `store_id` seed Cell Ponto)

---

## 1. Contrato HTTP (igual Fase 1)

Envelope:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

Códigos: `VALIDATION_ERROR` | `UNAUTHORIZED` | `NOT_FOUND` | `CONFLICT` | `INTERNAL_ERROR`.

- Prefixo: `API_PREFIX=api/v1`  
- Auth: Bearer JWT em **todas** as rotas desta fase (exceto se documentado público)  
- Escopo: sempre filtrar / gravar com `storeId` do usuário logado (`User.storeId`)  
- IDs públicos com prefixo (string): `CLI-` `STK-` `PED-` `FIN-` `TAB-` `PAY-` `OS-` `OL-` `ATTR-` `PH-` `CL-`  
- Dinheiro: `Decimal(12,2)` / JSON number; amount sempre **≥ 0**; sinal via `type` `in`|`out`  
- Datas: ISO-8601 string no JSON  

Interceptor atual já envelopa `data` — manter.

---

## 2. Drift Prisma × front (obrigatório migrar)

O schema Prisma da Fase 1 está **atrasado** em relação ao front. Antes ou junto dos endpoints, criar migration.

### 2.1 Enums (já ok se Fase 1 enums estiverem atualizados)

```
PlanId: bronze | silver | golden
ModuleId: totem | os | erp | fiscal | ecommerce
```

Novos / confirmar:

```
QuoteStatus: none | draft | sent | approved | rejected
WorkOrderPhotoKind: entry | exit | other
ChecklistMark: unchecked | ok | fail | na
```

(Os enums de OS status/priority/disposition/line kind e stock/finance já existem.)

### 2.2 `Customer` — campos a adicionar

Front (`adminStore.ts`):

| Campo JSON | SQL | Default |
|---|---|---|
| `zipCode` | `zip_code TEXT` | `''` |
| `street` | `street TEXT` | `''` |
| `number` | `number TEXT` | `''` |
| `complement` | `complement TEXT` | `''` |
| `neighborhood` | `neighborhood TEXT` | `''` |
| `state` | `state CHAR(2)` | `''` |
| `active` | `active BOOLEAN` | `true` |

Manter: `id`, `storeId`, `name`, `phone`, `phoneDigits` (unique por loja), `document`, `email`, `city`, `createdAt`.

### 2.3 `StockItem` — campos a adicionar

| Campo JSON | SQL | Default |
|---|---|---|
| `showOnTotem` | `show_on_totem BOOLEAN` | `false` |
| `images` | tabela `stock_item_images(id, stock_id, url, sort)` **ou** `String[]` | `[]` |
| `supplierId` | `supplier_id TEXT NULL` | — |
| `fiscalClassificationId` | `fiscal_classification_id TEXT NULL` | — |
| `warehouseId` | `warehouse_id TEXT NULL` | — |
| `trackLot` | `track_lot BOOLEAN` | `false` |
| `isKit` | `is_kit BOOLEAN` | `false` |

Manter attrs em `stock_item_attributes`.  
`color` / `capacity` podem continuar como colunas legado **ou** só via attrs (`ATTR-COR` / `ATTR-CAP`).

### 2.4 `SalesOrder` — campos a adicionar

| Campo JSON | SQL |
|---|---|
| `customerDocument` | `customer_document TEXT default ''` |
| `sellerId` | `seller_id TEXT default ''` |
| `sellerName` | `seller_name TEXT default ''` |

Já devem existir (se não, criar): `customerPhone`, `discount`, `surcharge`, `paymentMethodId?`, `priceTableId?`, linhas em `sales_order_lines`.

### 2.5 `WorkOrder` — expandir model (hoje incompleto no Prisma)

Campos que o front já usa e o Prisma precisa ter:

```
customerDocument, customerEmail
itemBrand, itemModel, itemColor
devicePassword, accessories, conditionOnEntry
diagnosis, estimatedReadyAt
sellerId
photos[]          → tabela work_order_photos
checklist[]       → tabela work_order_checklist_items
customerSignature, customerSignedAt?, customerSignedName
quoteStatus, quoteNotes, quoteValidUntil, quoteSentAt?, quoteDecidedAt?
progressStartedAt?, deliveredAt?
```

Manter: `customerName`, `customerPhone`, `itemName`, `itemRef`, `defect`, `notes`, `technician`, `priority`, `status`, `labor`, `lines`, `assetDisposition`, `purchase*`, `revenueFinanceId`, timestamps.

**Não persistir como fonte da verdade:** `parts` (derivar de linhas `kind=part`). Pode manter coluna denormalizada atualizada no ledger.

### 2.6 `TotemSettings`

Adicionar:

| Campo | SQL | Default |
|---|---|---|
| `exitPassword` | `exit_password TEXT` | `cellponto` |
| `shareStockWithErp` | `share_stock_with_erp BOOLEAN` | `false` |

### 2.7 Fotos / assinatura (MVP)

Fotos e assinatura no front são **data URL** (JPEG/PNG). Na Fase 2:

- Opção A (rápida): gravar `TEXT` / `BYTEA` no Postgres (ok para demo; limitar tamanho no DTO, ex. 400kb)  
- Opção B: upload S3/storage depois  

Documentar a opção escolhida. Aceitar A no MVP.

---

## 3. Dicionário de entidades (contrato JSON do front)

### 3.1 Customer

```ts
{
  id: string;              // CLI-…
  name: string;
  phone: string;           // dedupe por dígitos
  document: string;
  email: string;
  city: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  state: string;           // UF
  active: boolean;
  createdAt: string;       // ISO
}
```

Upsert PDV: se telefone ≥ 8 dígitos, match `phoneDigits` na loja.

### 3.2 ProductAttribute

```ts
{
  id: string;              // ATTR-… (seed ATTR-COR, ATTR-CAP, ATTR-RET)
  name: string;
  values: string[];        // ≥1
  priceDeltas: Record<string, number>; // chave = value
  useOnTotem: boolean;
  filterOnTotem: boolean;
  useOnStock: boolean;
  sort: number;
  active: boolean;
}
```

Máx. **5** atributos por loja. Valores em tabela filha + `price_delta`.

### 3.3 StockItem

```ts
{
  id: string;              // STK-…
  name: string;
  sku: string;
  barcode: string;
  imei: string;
  color: string;           // legado
  capacity: string;        // legado
  attrs: Record<string, string>; // attributeId → value
  qty: number;
  minQty: number;
  cost: number;
  price: number;
  kind: 'part' | 'device' | 'supply';
  condition: 'new' | 'used' | 'refurbished';
  sourceWorkOrderId?: string;
  showOnTotem: boolean;
  images: string[];
  supplierId?: string;
  fiscalClassificationId?: string;
  warehouseId?: string;
  trackLot?: boolean;
  isKit?: boolean;
}
```

Lookup: sku / barcode / imei / id (exato) ou nome único (substring).

### 3.4 PriceTable / PaymentMethod

```ts
PriceTable: { id, name, percent: number, active: boolean }
PaymentMethod: {
  id, name,
  type: 'cash' | 'pix' | 'debit' | 'credit' | 'other',
  priceTableId: string,
  maxInstallments: number, // ≥1
  active: boolean
}
```

Preço com tabela (**não persistir**): `round(base * (1 + percent/100), 2)`.

### 3.5 SalesOrder + lines (close sale)

Persistido:

```ts
SalesOrder: {
  id: string;              // PED-…
  ticketId: string | null;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  productName: string;     // resumo "1x A, 2x B"
  amount: number;
  discount: number;
  surcharge: number;
  status: 'open' | 'sold' | 'cancelled'; // PDV grava 'sold'
  payment: string;         // "Pix · Vista"
  paymentMethodId?: string | null;
  priceTableId?: string | null;
  sellerId: string;
  sellerName: string;
  createdAt: string;
}

SalesOrderLine: {
  id: string;
  stockId: string | null;
  name: string;
  qty: number;
  unitPrice: number;       // já com tabela
  imei: string;
}
```

Body sugerido `POST /pos/sales`:

```ts
{
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  paymentName: string;
  priceTableName: string;
  paymentMethodId?: string;
  priceTableId?: string;
  discount: number;
  surcharge: number;
  sellerId?: string;
  sellerName?: string;
  lines: Array<{
    stockId: string;
    name: string;
    qty: number;
    unitPrice: number;
    imei: string;
  }>;
}
```

`amount = max(0, Σ(unitPrice*qty) − discount + surcharge)`.

**Transação única:** criar pedido + linhas + finance `in` `pos` + baixar estoque + limpar IMEI + upsert cliente.

### 3.6 FinanceEntry

```ts
{
  id: string;              // FIN-…
  type: 'in' | 'out';
  label: string;
  amount: number;          // ≥ 0
  createdAt: string;
  source: 'manual' | 'pos' | 'os_part' | 'os_purchase' | 'os_revenue' | 'os_reversal';
  refId?: string;          // PED-… ou OS-…
}
```

Não persistir saldo (derivar).

### 3.7 WorkOrder (+ filhos)

```ts
WorkOrder: {
  id: string;                    // OS-…
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument: string;
  customerEmail: string;
  itemName: string;
  itemBrand: string;
  itemModel: string;
  itemColor: string;
  itemRef: string;
  devicePassword: string;
  accessories: string;
  conditionOnEntry: string;
  defect: string;
  diagnosis: string;
  notes: string;
  estimatedReadyAt: string;
  technician: string;
  sellerId: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'diagnosis' | 'waiting' | 'progress' | 'ready' | 'delivered' | 'cancelled';
  labor: number;
  parts: number;                 // derivado se houver lines part
  lines: WorkOrderLine[];
  photos: WorkOrderPhoto[];
  checklist: WorkOrderChecklistItem[];
  customerSignature: string;
  customerSignedAt?: string;
  customerSignedName: string;
  assetDisposition: 'customer' | 'purchased' | 'scrapped';
  quoteStatus: 'none' | 'draft' | 'sent' | 'approved' | 'rejected';
  quoteNotes: string;
  quoteValidUntil: string;
  quoteSentAt?: string;
  quoteDecidedAt?: string;
  purchaseCost?: number;
  purchaseAt?: string;
  purchaseStockId?: string;
  purchaseFinanceId?: string;
  revenueFinanceId?: string;
  progressStartedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

WorkOrderLine: {
  id: string;              // OL-…
  stockId: string;
  name: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  kind: 'part' | 'labor';
  financeId?: string;
}

WorkOrderPhoto: {
  id: string;              // PH-…
  kind: 'entry' | 'exit' | 'other';
  dataUrl: string;
  caption: string;
  createdAt: string;
}

WorkOrderChecklistItem: {
  id: string;              // CL-…
  label: string;
  mark: 'unchecked' | 'ok' | 'fail' | 'na';
  note: string;
}
```

Board (kanban) usa colunas: `open`, `diagnosis`, `waiting`, `progress`, `ready` (delivered/cancelled fora do board).

### 3.8 StoreEntitlement / TotemSettings / OperatorProfile

```ts
StoreEntitlement: {
  planId: 'bronze' | 'silver' | 'golden';
  modules: Array<'totem' | 'os' | 'erp' | 'fiscal' | 'ecommerce'>;
}
// Bronze=1, Silver≤2, Golden=todos 5

TotemSettings: {
  mode: 'kiosk' | 'catalog';
  exitPassword: string;
  shareStockWithErp: boolean;
}

OperatorProfile: {
  displayName: string;
  role: string;            // texto livre
  photo: string | null;    // data URL
}
// PK = userId
```

---

## 4. Endpoints a implementar

Todas sob `/api/v1`, Bearer obrigatório, escopo `storeId`.

### 4.1 Customers

| Método | Path | Notas |
|---|---|---|
| GET | `/customers` | query `q?` busca nome/telefone/doc |
| GET | `/customers/:id` | |
| POST | `/customers` | body Customer sem id/createdAt |
| PATCH | `/customers/:id` | |
| DELETE | `/customers/:id` | soft: `active=false` preferível |

### 4.2 Attributes

| Método | Path |
|---|---|
| GET | `/attributes` |
| POST | `/attributes` | max 5 |
| PATCH | `/attributes/:id` |
| DELETE | `/attributes/:id` |

### 4.3 Stock

| Método | Path |
|---|---|
| GET | `/stock` | filtros `kind?`, `condition?`, `q?`, `low?` (qty≤minQty) |
| GET | `/stock/lookup?code=` | sku/barcode/imei/id/nome |
| GET | `/stock/:id` | |
| POST | `/stock` | |
| PATCH | `/stock/:id` | |
| DELETE | `/stock/:id` | |

### 4.4 Price tables & payments

| Método | Path |
|---|---|
| CRUD | `/price-tables` |
| CRUD | `/payments` | valida FK `priceTableId` |

### 4.5 Finance

| Método | Path |
|---|---|
| GET | `/finance` | query `source?`, `from?`, `to?` |
| POST | `/finance` | só manual: `{ type, amount, label }` → `source=manual` |

### 4.6 Orders / POS sale

| Método | Path |
|---|---|
| GET | `/orders` | lista pedidos |
| GET | `/orders/:id` | com lines |
| POST | `/pos/sales` | **transação** closePosSale |

### 4.7 Work orders

| Método | Path | Body / comportamento |
|---|---|---|
| GET | `/work-orders` | `status?`, `technician?`, `q?` |
| GET | `/work-orders/:id` | OS completa + lines + photos + checklist |
| POST | `/work-orders` | criar (campos create do front) |
| PATCH | `/work-orders/:id` | status, labor, notes, diagnosis, priority, technician, sellerId, estimatedReadyAt, disposition (sem purchase), quote fields, etc. |
| POST | `/work-orders/:id/parts` | `{ stockId, qty, unitPrice? }` → ledger consume |
| DELETE | `/work-orders/:id/parts/:lineId` | estorno |
| POST | `/work-orders/:id/purchase` | `{ cost, price?, sku?, imei?, name?, kind? }` |
| POST | `/work-orders/:id/deliver` | receita + status delivered |
| POST | `/work-orders/:id/cancel` | reversões |
| POST | `/work-orders/:id/photos` | `{ kind, dataUrl, caption? }` |
| DELETE | `/work-orders/:id/photos/:photoId` | |
| PATCH | `/work-orders/:id/checklist/:itemId` | `{ mark, note? }` |
| POST | `/work-orders/:id/signature` | `{ dataUrl, signedName }` |
| DELETE | `/work-orders/:id/signature` | |
| POST | `/work-orders/:id/quote/draft` | `{ notes?, validUntil?, labor? }` |
| POST | `/work-orders/:id/quote/send` | |
| POST | `/work-orders/:id/quote/approve` | `{ moveToProgress?: boolean }` |
| POST | `/work-orders/:id/quote/reject` | |
| POST | `/work-orders/:id/quote/reopen` | |

Resposta dos eventos ledger: OS completa atualizada (e stock quando purchase).

### 4.8 Store / me

| Método | Path |
|---|---|
| GET/PUT | `/store/plan` | entitlement |
| GET/PUT | `/store/totem-settings` | |
| GET/PUT | `/me/profile` | operator profile |

---

## 5. Regras transacionais (ledger) — obrigatórias

Porta de referência no front: `apps/web/src/data/workshopLedger.ts` + ADR `docs/adr/0003-workshop-stock-finance-ledger.md`.

Usar **transaction Prisma** (`$transaction`) em cada evento.

| Evento | Estoque | Financeiro | Bloqueios |
|---|---|---|---|
| Consumir peça | `qty − n` | `out` `os_part` = `cost×qty` | OS delivered/cancelled; qty insuficiente |
| Estornar peça | `qty + n` | `in` `os_reversal` | OS delivered; só `kind=part` com stockId |
| Comprar recondicionado | `+1` device refurbished, `sourceWorkOrderId=osId` | `out` `os_purchase` = cost | já comprado nesta OS; `price` default `round(cost*1.35,2)`; sku `REC-…` |
| Entregar | — | `in` `os_revenue` = labor + Σ(unitPrice×qty) se total>0 e sem revenueFinanceId | set `deliveredAt`, status `delivered` |
| Cancelar | estorna peças; se purchase e stock qty≥1 remove stock + estorna compra | `os_reversal` | **recusar** se já tem `revenueFinanceId` ou recondicionado já vendido (qty&lt;1) |
| Venda PDV | `qty − n`; limpa IMEI | `in` `pos` | cria PED + linhas + upsert cliente |

Regra de negócio: **custo na ação**; **receita na entrega OS / no PDV**.

`parts` na OS: se existem linhas `part`, recalcular `Σ unitPrice*qty`; senão manter valor legado.

---

## 6. Ordem de implementação sugerida (commits)

1. `feat(db): migrate customer/stock/sales/work-order/totem field drift`  
2. `feat: customers CRUD`  
3. `feat: attributes CRUD`  
4. `feat: stock CRUD + lookup`  
5. `feat: price-tables + payment-methods CRUD`  
6. `feat: finance list + manual create`  
7. `feat: POST /pos/sales transaction + GET /orders`  
8. `feat: work-orders CRUD + PATCH status`  
9. `feat: work-orders ledger (parts, purchase, deliver, cancel)`  
10. `feat: work-orders photos, checklist, signature, quote`  
11. `feat: store plan + totem-settings + me/profile`  
12. Seed mínimo: tabelas Vista/Atacado/Cartão, pagamentos Dinheiro/Pix/Débito/Crédito, 2 clientes demo (opcional)

---

## 7. Seed / dados iniciais (opcional mas útil)

Por loja Cell Ponto:

- Price tables: Vista 0%, Atacado −8%, Cartão +5%  
- Payments: Dinheiro/Pix/Débito → Vista 1x; Crédito → Cartão 12x  
- Attributes: já seedados na Fase 1 (COR/CAP/RET)  
- Checklist default da OS: copiar labels de `buildDefaultChecklist()` no front (`osStore.ts`)

---

## 8. Aceite Fase 2

- [ ] Migration aplica em Discloud (`migrate deploy` no START)  
- [ ] CRUD customers / stock / attributes / price-tables / payments com JWT  
- [ ] `POST /pos/sales` baixa estoque + finance `pos` + pedido com lines (tudo ou nada)  
- [ ] `POST …/parts` e `DELETE …/parts/:lineId` respeitam bloqueios e qty  
- [ ] `POST …/purchase` cria STK refurbished ligado à OS  
- [ ] `POST …/deliver` lança `os_revenue` uma vez  
- [ ] `POST …/cancel` recusa se já faturada  
- [ ] GET work-orders devolve photos/checklist/quote fields  
- [ ] Swagger documenta os novos módulos  
- [ ] Front ainda **não** precisa estar plugado nesta entrega — mas o contrato JSON deve bater com as tabelas acima para o wire seguinte  

---

## 9. O que o agente do Backend deve fazer ao receber este prompt

1. Confirmar models atuais no `schema.prisma` e listar o gap vs §2.  
2. Escrever migration + atualizar Prisma Client.  
3. Implementar módulos Nest na ordem §6 (services + controllers + DTOs class-validator).  
4. Testar com curl/Postman (login seed → CRUD → POS sale → OS ledger).  
5. **Não** implementar fiscal/caixa/CRM/e-commerce nesta PR.  
6. Ao final, devolver: endpoints prontos, migration name, e lista do que falta para o front plugar.

---

## 10. Arquivos do Frontend para copiar tipos se precisar

| Arquivo | Conteúdo |
|---|---|
| `apps/web/src/data/adminStore.ts` | Customer, Stock, PriceTable, Payment, SalesOrder, Finance, closePosSale |
| `apps/web/src/data/osStore.ts` | WorkOrder completo, quote, photos, checklist, agenda helpers |
| `apps/web/src/data/workshopLedger.ts` | consume / remove / purchase / deliver / cancel |
| `apps/web/src/data/attributeStore.ts` | ProductAttribute |
| `apps/web/src/data/storePlan.ts` | StoreEntitlement + regras de plano |
| `apps/web/src/data/totemSettings.ts` | TotemSettings |
| `apps/web/src/data/operatorProfile.ts` | OperatorProfile |
| `docs/specs/workshop-stock-finance.md` | Spec ledger |
| `docs/adr/0003-workshop-stock-finance-ledger.md` | ADR |

---

## 11. Resumo em uma frase

**Fase 2 = API autenticada do painel ERP+OS+PDV+financeiro no Nest/Prisma, com ledger transacional igual ao `workshopLedger.ts`, alinhando o schema ao contrato atual do front — sem fiscal/caixa/CRM ainda.**
