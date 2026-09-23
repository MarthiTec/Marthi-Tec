# Prompt — Fase 3 Nest (tudo que ainda é mock no front)

Cole este arquivo no chat do repositório **Marthi-Backend** (`E:\Projetos\Marthi\Backend` / GitHub MarthiTec/Marthi-Backend).

**Front de referência:** `apps/web/src/data/*` no repo Frontend.  
**Já pronto (Fase 1+2):** auth JWT, partners, products públicos, customers, attributes, stock, price-tables, payments, finance (lançamentos), orders + `POST /pos/sales`, work-orders + ledger, store plan/totem-settings, me/profile.  
**Host:** `https://marthi-backend.discloud.app` · CORS com `localhost:5173` / `127.0.0.1:5173`.

---

## COMO USAR ESTE DOC (obrigatório)

Este arquivo é o **mapa completo** da Fase 3. **Não implemente tudo num único monólito.**

1. Leia o doc inteiro para mapear o gap.  
2. Na mensagem do humano virá: **`Implemente somente a onda PX`** (ex.: P0).  
3. Entregue **só essa onda**: migration + módulos + seed + aceite da onda + lista de endpoints.  
4. Faça commit da onda e pare. Aguarde a próxima mensagem para P1, P2…  
5. Se a mensagem disser “P0”, ignore P1–P4 nesta rodada.

**Ordem fixa:** P0 → P1 → P2 → P3 → P4.

**Por que esta fase:** o front ainda mostra mock/`localStorage` porque faltam endpoints Nest. Back primeiro; wire no front depois de cada onda.

---

## 0. Objetivo (mapa completo)

Persistir no Postgres (Prisma) + REST autenticado **tudo** que ainda é mock operacional no painel:

| Onda | Domínio | Store front | Nota |
|---|---|---|---|
| **P0** | Vendedores / fornecedores / funcionários + ACL | `erpRegistry.ts` | Vaza mock no PDV/OS |
| **P0** | Fila totem → PDV (migrar Express) | `posQueueStore` + `services/totem.ts` / `pos.ts` | `PosTicket` já no Prisma |
| **P1** | Livro financeiro (contas, AP/AR, tesouraria, adiantamentos) | `financeBook.ts` | Separado de `/finance` |
| **P1** | Almoxarifado / lotes / kits / movimentos | `fiscalCatalog.ts` (WH) | |
| **P1** | Notas entrada/saída (estoque) | `invoiceStore.ts` | **Não** é NF-e SEFAZ |
| **P2** | Caixa / sangria / vales / trocas | `cashRegisterStore.ts` | |
| **P2** | Catálogo fiscal NCM/CFOP/FECP/classificação | `fiscalCatalog.ts` | Sem transmissão |
| **P2** | Settings do emissor (cadastro) | `fiscalIssuerStore.ts` | Sem SEFAZ; sem guard de cert real |
| **P2** | Cache tabelas CST / cClassTrib | `fiscalTaxTables.ts` | CRUD/sync stub |
| **P3** | CRM kanban + atividades + chat | `crmStore.ts` | Sem seed CRM-MOCK |
| **P3** | E-commerce canais/listings/orders | `ecommerceStore.ts` | Sem OAuth |
| **P4** | Auditoria do painel | `auditLog.ts` | |
| **P4** | Analytics cliques totem | `totemAnalyticsStore.ts` | |

**Fora desta fase (não implementar no Nest agora):**

- Emissão/autorização real NF-e, NFC-e, NFS-e, CT-e, MDF-e (`fiscalDocuments.ts` provider mock fica no front até Fase 4 fiscal)  
- OAuth Mercado Livre / Shopee / Amazon  
- `demoLeadStore` / gates de marketing da homepage Marthi  
- Tickets de suporte da HelpPage  
- Multi-tenant real (1 loja seed Cell Ponto)  
- Remover seed/`localStorage` do **Frontend** (tarefa do front após cada onda)

---

## 1. Contrato HTTP (igual Fase 2)

Envelope:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

Códigos: `VALIDATION_ERROR` | `UNAUTHORIZED` | `FORBIDDEN` | `NOT_FOUND` | `CONFLICT` | `INTERNAL_ERROR`.

- Prefixo `API_PREFIX=api/v1`  
- Bearer JWT em todas as rotas (exceto `POST /totem/leads` e `POST /totem/analytics/clicks` — públicos)  
- Escopo sempre `storeId` do usuário (ou loja seed no lead/analytics totem)  
- IDs com prefixo: `VEN-` `FOR-` `EMP-` `ACC-` `PAYB-` `RECV-` `TRS-` `ADV-` `CX-` `CRD-` `EXC-` `ALX-` `LOT-` `KIT-` `MOV-` `FCL-` `CFOP-` `FECP-` `INV-` `IL-` `CRM-` `ACT-` `MSG-` `LST-` `EORD-` `AUD-` `TCK-`  
- Dinheiro: `Decimal(12,2)` / JSON number ≥ 0  
- Datas: ISO-8601  

Swagger em todos os módulos novos.

---

## 2. Wave P0-A — Registry (vendedores / fornecedores / funcionários)

### 2.1 Prisma

```prisma
enum EmployeeRole {
  admin
  manager
  operator
  seller
  @@map("employee_role")
}

enum AccessArea {
  totem
  pdv
  os
  erp_customers
  erp_stock
  erp_attrs
  erp_prices
  erp_payments
  erp_finance
  erp_sellers
  erp_suppliers
  erp_employees
  erp_audit
  erp_invoices
  erp_fiscal
  ecommerce
  erp_plan
  @@map("access_area")
}

model Seller {
  id                 String   @id
  storeId            String   @map("store_id")
  store              Store    @relation(...)
  name               String
  phone              String   @default("")
  email              String   @default("")
  document           String   @default("")
  commissionPercent  Decimal  @default(0) @map("commission_percent") @db.Decimal(6, 2)
  active             Boolean  @default(true)
  employeeId         String?  @map("employee_id")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")
  @@index([storeId, name])
  @@map("sellers")
}

model Supplier {
  id         String   @id
  storeId    String   @map("store_id")
  name       String
  tradeName  String   @default("") @map("trade_name")
  document   String   @default("")
  phone      String   @default("")
  email      String   @default("")
  city       String   @default("")
  notes      String   @default("")
  active     Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  @@index([storeId, name])
  @@map("suppliers")
}

model Employee {
  id            String         @id
  storeId       String         @map("store_id")
  name          String
  phone         String         @default("")
  email         String         @default("")
  document      String         @default("")
  role          EmployeeRole   @default(operator)
  isSystemUser  Boolean        @default(false) @map("is_system_user")
  userEmail     String         @default("") @map("user_email") // lowercased
  accessAreas   AccessArea[]   @map("access_areas")
  active        Boolean        @default(true)
  sellerId      String?        @map("seller_id")
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")
  @@index([storeId, name])
  @@index([storeId, userEmail])
  @@map("employees")
}
```

Opcional (recomendado): FK `SalesOrder.sellerId` / `WorkOrder.sellerId` → `Seller.id` (nullable; manter `sellerName` denormalizado).

### 2.2 JSON (igual front)

```ts
Seller: {
  id, name, phone, email, document,
  commissionPercent: number, active,
  employeeId?: string, createdAt, updatedAt
}

Supplier: {
  id, name, tradeName, document, phone, email, city, notes,
  active, createdAt, updatedAt
}

Employee: {
  id, name, phone, email, document,
  role: 'admin'|'manager'|'operator'|'seller',
  isSystemUser: boolean,
  userEmail: string,
  accessAreas: AccessArea[],
  active, sellerId?: string, createdAt, updatedAt
}
```

### 2.3 Endpoints

| Método | Path | Notas |
|---|---|---|
| GET/POST | `/sellers` | query `active?=true` |
| GET/PATCH/DELETE | `/sellers/:id` | DELETE = soft `active=false` preferível |
| GET/POST | `/suppliers` | |
| GET/PATCH/DELETE | `/suppliers/:id` | |
| GET/POST | `/employees` | |
| GET/PATCH/DELETE | `/employees/:id` | |
| GET | `/me/access` | `{ role, accessAreas, employeeId?, sellerId? }` resolvido pelo `user.email` ↔ `Employee.userEmail` |

Regras:

- Admin da loja (`role=admin` ou primeiro usuário seed) tem todas as `AccessArea`  
- Seed Cell Ponto: 1 admin, 1 operador (Ana), 1 vendedor (Bruno), 1 fornecedor (CelSul) — espelhar `erpRegistry.ts` seed  
- Validar `sellerId` / `employeeId` cruzados quando informados  
- **Não** criar User automaticamente ao marcar `isSystemUser` nesta fase (só cadastrar vínculo de e-mail); login continua JWT atual

---

## 3. Wave P0-B — Totem leads + fila PDV (migrar Express → Nest)

O Prisma **já tem** `PosTicket` + `PosTicketAttribute` (Fase 2). Hoje o Express do Site totem atende:

- `POST /api/v1/totem/leads` (público)  
- `GET /api/v1/pos/tickets`  
- `PATCH /api/v1/pos/tickets/:id`  

### 3.1 Endpoints no Nest

| Método | Path | Auth | Comportamento |
|---|---|---|---|
| POST | `/totem/leads` | **@Public** | cria `PosTicket` status `open`, source `totem`, loja seed Cell Ponto; opcional WhatsApp depois |
| GET | `/pos/tickets` | Bearer | lista tickets da loja; query `status?` |
| GET | `/pos/tickets/:id` | Bearer | |
| PATCH | `/pos/tickets/:id` | Bearer | `{ status: open\|sold\|cancelled }` + `closedAt` |
| POST | `/pos/tickets` | Bearer | cria ticket manual (source `manual`) |

### 3.2 Body lead (front `TotemLeadRequest`)

```ts
{
  customerName: string;
  customerPhone: string;
  productName: string;
  attributes?: Array<{ id: string; name: string; value: string }>;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
}
```

Resposta: `{ id, customerNotified?: boolean }` (WhatsApp opcional / stub `false`).

### 3.3 JSON ticket (igual `QueueTicket` / `PosTicket` front)

```ts
{
  id, source: 'totem'|'manual', status: 'open'|'sold'|'cancelled',
  customerName, customerPhone, productName,
  attributes?: { id, name, value }[],
  color, storage, fulfillment, payment,
  installment: string | null, priceLabel,
  createdAt, closedAt: string | null
}
```

### 3.4 Ligação com venda

`POST /pos/sales` já aceita `ticketId` — ao fechar venda com ticket, marcar ticket `sold` + `closedAt` na mesma transaction (se ainda não faz).

**Deploy:** após Nest, o Site totem deixa de depender do Express para leads/tickets (front aponta para Nest). Documentar no README.

---

## 4. Wave P1-A — Livro financeiro (`financeBook`)

**Não confundir** com `FinanceEntry` (lançamentos da Fase 2: `GET/POST /finance`). São domínios separados:

- `/finance` = extrato de caixa lógico (pos, os_*, manual)  
- `/finance-book/*` = contas bancárias, pagar, receber, tesouraria, adiantamentos  

### 4.1 Models

```
BankAccount: id, storeId, name, bank, agency, number,
  type: checking|savings|cash|digital,
  initialBalance, active, createdAt, updatedAt

Payable: id, storeId, description, supplierId?, supplierName,
  category, amount, paidAmount, dueDate (date string YYYY-MM-DD),
  status: open|partial|paid|cancelled,
  accountId, notes, createdAt, updatedAt, paidAt?

Receivable: id, storeId, description, customerName, category,
  amount, receivedAmount, dueDate, status, accountId, notes,
  createdAt, updatedAt, receivedAt?

TreasuryMove: id, storeId, kind: transfer|deposit|withdraw|adjustment,
  fromAccountId, toAccountId, amount, description, at

AdvancePayment: id, storeId, kind: customer|supplier, partyName,
  amount, usedAmount, accountId, notes,
  status: open|applied|refunded, createdAt, updatedAt
```

### 4.2 Endpoints

| Prefixo | CRUD |
|---|---|
| `/bank-accounts` | list/create/patch/delete(soft) |
| `/payables` | list (`status?`, `from?`, `to?`) + create/patch + `POST /:id/pay` `{ amount, accountId?, at? }` |
| `/receivables` | list + create/patch + `POST /:id/receive` |
| `/treasury` | list + `POST` movimento (atualiza saldos derivados) |
| `/advances` | list + create + `POST /:id/apply` / `refund` |

Saldo de conta = `initialBalance` + deposits/receives − withdraws/pays ± transfers (derivar; não coluna obrigatória).

Seed: 2 contas (Caixa loja + Conta operacional) como no front.

Categorias sugeridas (validação soft / string livre ok):

- Despesa: Fornecedores, Aluguel, Folha, Impostos, Marketing, Utilidades, Manutenção, Outras despesas  
- Receita: Vendas PDV, Serviços OS, Recebimentos, Outras receitas  

---

## 5. Wave P1-B — Almoxarifado / lotes / kits

### 5.1 Models

```
Warehouse: id, storeId, name, code, address, active

ProductLot: id, storeId, stockId, stockName, lotNumber,
  manufacturingDate, expiryDate, qty, supplierId?, supplierName,
  warehouseId, notes, createdAt

ProductKit: id, storeId, name, sku, parentStockId?, active, createdAt, updatedAt
ProductKitItem: kitId, stockId, stockName, qty

WarehouseMove: id, storeId, kind: in|out|transfer|adjust,
  stockId, stockName, fromWarehouseId, toWarehouseId,
  qty, note, createdAt, operatorName
```

### 5.2 Endpoints

| Prefixo | Ações |
|---|---|
| `/warehouses` | CRUD |
| `/lots` | list (`stockId?`) + create + patch qty |
| `/kits` | CRUD + items |
| `/warehouse-moves` | list + `POST` (transação: ajustar qty stock e/ou lotes) |

Seed: `ALX-01` Loja + `ALX-BANC` Bancada OS.

Ao criar/atualizar `StockItem`, validar `warehouseId` se informado (FK opcional).

---

## 6. Wave P2-A — Caixa PDV

### 6.1 Models

```
CashSession: id, storeId, openedAt, closedAt?, openingFloat,
  expectedCash, countedCash?, difference?, operatorName,
  status: open|closed, reopenCount

CashMovement: id, sessionId, kind: open|aporte|sangria|sale|exchange|vale|close|drawer,
  amount, note, reason?, beneficiaryType?: store|employee,
  beneficiaryId?, beneficiaryName?, createdAt, operatorName

StoreCredit: id, storeId, code, customerName, customerPhone,
  amount, remaining, note, createdAt, operatorName,
  status: open|used|cancelled, orderId?

ExchangeRecord: id, storeId, orderId, customerName, customerPhone,
  returnLines JSON, outLines JSON, returnTotal, outTotal,
  cashDelta, creditId?, note, createdAt, operatorName
```

**Regra:** no máximo **1 sessão `open` por loja**.

### 6.2 Endpoints

| Método | Path |
|---|---|
| GET | `/cash/sessions` · `/cash/sessions/open` · `/cash/sessions/:id` |
| POST | `/cash/sessions/open` `{ openingFloat, operatorName }` |
| POST | `/cash/sessions/:id/aporte` · `/sangria` · `/drawer` |
| POST | `/cash/sessions/:id/close` `{ countedCash, operatorName }` |
| POST | `/cash/sessions/:id/reopen` (incrementa `reopenCount`, só se closed) |
| GET/POST | `/cash/credits` · `POST /cash/credits/:id/use` |
| GET/POST | `/cash/exchanges` |

Integrar com `POST /pos/sales`: se houver sessão aberta, lançar movement `sale` com `amount` da venda (mesma transaction ou after-hook).

Motivos sangria/aporte: strings livres; front envia de listas `SANGRIA_REASONS` / `APORTE_REASONS`.

---

## 7. Wave P2-B — Catálogo fiscal (cadastro only)

**Sem** transmissão SEFAZ. Só CRUD de tabelas usadas no estoque/notas MVP.

```
FiscalClassification: id, storeId, name, ncm, cstIcms, cClasTrib,
  icmsRate, ipiCst, ipiRate, pisCst, pisRate, cofinsCst, cofinsRate,
  ibsRate, cbsRate, defaultCfopId, notes, active, createdAt, updatedAt

CfopCode: id, storeId, code, description,
  operation: in_same|in_other|out_same|out_other|other, active

FecpRule: id, storeId, uf, description, rate, active
```

Endpoints: `/fiscal-classifications`, `/cfops`, `/fecps` (CRUD).

Validar `StockItem.fiscalClassificationId` quando informado.

---

## 8. Wave P3-A — CRM (MVP)

Implementar núcleo do kanban; chat/rede social pode ser mínimo.

```
CrmLead: id, storeId, name, email, whatsapp, source, interest, value,
  stage: leads|waiting|attending|payment|won|lost,
  ownerSellerId?, ownerName, claimedAt?, notes,
  externalRef?, customerId?, paidAt?,
  graduation?, polo?, sourceInfo?, hideContact?,
  createdAt, updatedAt

CrmActivity: id, leadId, kind, title, body, fromSellerId?, fromName, createdAt, dueAt?

CrmMessage: id, storeId, kind: lead|sellers, leadId?, sellerPairKey?,
  fromSellerId?, fromName, body, createdAt

CrmSellerProfile: sellerId PK, displayName, handle, bio, avatarUrl, coverUrl,
  city, specialty, whatsapp, instagram, linkedin, website, publicProfile, updatedAt
```

### Endpoints mínimos

| Path | Ações |
|---|---|
| `/crm/leads` | list (`stage?`) + create + patch |
| `/crm/leads/:id/claim` | `{ sellerId }` exclusivo |
| `/crm/leads/:id/move` | `{ stage }` |
| `/crm/leads/:id/activities` | list + post |
| `/crm/leads/:id/messages` | list + post |
| `/crm/profiles/:sellerId` | get/put |
| `/crm/messages/sellers` | list/post por par |

**Não** seedar `CRM-MOCK-*` no banco (front remove mocks no wire).

Ingest público opcional depois: homepage demo → `POST /crm/leads` com source `demo` (auth admin ou token interno).

---

## 9. Wave P3-B — E-commerce MVP (sem OAuth)

Persistir estado local atual; sync marketplace = stub.

```
EcommerceChannelState: storeId + channelId PK,
  status, storeName, lastSyncAt, message, credentials JSON

EcommerceListing: id, storeId, channelId, stockId, externalId, title, sku,
  price, qty, images String[], status, syncedAt, message

EcommerceOrder: id, storeId, channelId, externalId, customerName, amount,
  status, createdAt, stockId?, listingId?, qty?
```

`channelId`: `mercadolivre|shopee|ifood|amazon|tray`

Endpoints:

- `GET/PUT /ecommerce/channels/:id`  
- `POST /ecommerce/channels/:id/connect` · `/disconnect` · `/sync` (stub: atualiza `lastSyncAt` + message)  
- CRUD `/ecommerce/listings` · `GET /ecommerce/orders`  

Credenciais: armazenar criptografadas se possível (`AES` com `CREDENTIALS_SECRET`); nunca logar.

---

## 9.5 Wave P1-C — Notas de entrada/saída (`invoiceStore`)

Notas **internas de estoque** (não confundir com NF-e SEFAZ / `fiscalDocuments`).

### Models

```
StockInvoice: id, storeId, kind: entry|exit, number, status: draft|posted|cancelled,
  documentPurpose: normal|devolucao|credito_reforma|debito_reforma,
  supplierId?, customerName, issuedAt (date), notes,
  createdAt, updatedAt, postedAt?

StockInvoiceLine: id, invoiceId, stockId, name, qty, unitCost, unitPrice
```

### Endpoints

| Método | Path |
|---|---|
| GET/POST | `/stock-invoices` | query `kind?` `status?` |
| GET/PATCH | `/stock-invoices/:id` | patch só se `draft` |
| POST | `/stock-invoices/:id/lines` | |
| DELETE | `/stock-invoices/:id/lines/:lineId` | |
| POST | `/stock-invoices/:id/post` | **transação:** baixa/aumenta estoque; status `posted` |
| POST | `/stock-invoices/:id/cancel` | se posted, estornar estoque se possível |

Regras (espelhar `invoiceStore.ts`):

- `entry` exige `supplierId` válido se informado  
- `post` entry → `qty +=`; exit → `qty -=` (bloquear se insuficiente)  
- Só `draft` edita linhas  

---

## 9.6 Wave P2-C — Settings do emissor (`fiscalIssuerStore`)

Persistir preferências do hub fiscal **sem** transmitir à SEFAZ.

```
FiscalIssuerSettings: storeId PK,
  emitenteName, cnpj, ie, im, cMun, municipio, uf,
  certificateFileName, certificateBase64?,  -- senha NÃO persistir em texto puro (omitir ou vault)
  cscId, cscToken (criptografar),
  environment: homologacao|producao,
  nfeSeries, nfceSeries, nfseSeries, cteSeries, mdfeSeries,
  cbsRateBase, ibsRateBase, issqnRateDefault, issqnRetainedRate, issqnMunicipalCode,
  storageMode: local|cloud|both,
  localRootPath, localXmlPath, localLogPath, localPdfPath, localPdvPath,
  cloudEnabled, cloudBucketHint, updatedAt
```

Endpoints: `GET/PUT /fiscal/issuer-settings`

**Não** salvar `certificatePassword` em plain text. Aceitar no PUT e descartar ou guardar em campo encrypted opcional; documentar.

Fiscal logs (`FiscalLogEntry`): `GET/POST /fiscal/logs` — append-only, cap 400 por loja (opcional nesta onda; se não, front mantém local até P4).

---

## 9.7 Wave P2-D — Tabelas CST / cClassTrib (`fiscalTaxTables`)

```
FiscalCstCode: storeId + code PK, name, description, active
FiscalCClassTrib: storeId + code PK, name, cstCode, description, linkLc?, active
FiscalTaxTablesMeta: storeId PK, lastSyncAt, lastSyncSource: seed|api|manual, lastSyncMessage
```

Endpoints:

- `GET /fiscal/tax-tables` → `{ csts, cClassTribs, lastSyncAt, lastSyncSource, lastSyncMessage }`  
- `PUT /fiscal/tax-tables` → replace manual  
- `POST /fiscal/tax-tables/sync` → stub: marca `lastSyncSource=manual` ou tenta proxy SVRS se `FISCAL_TAX_SYNC=true` (default off)

Seed mínimo com alguns CST comuns (do seed do front).

---

## 9.8 Wave P4-A — Auditoria (`auditLog`)

```
AuditEntry: id, storeId, kind: access|action, at, actorName, actorEmail,
  action, detail, path
```

Endpoints:

- `GET /audit` query `kind?` `from?` `to?` `q?` — cap 400 mais recentes  
- `POST /audit` — body igual `logAudit` do front (Bearer)  

Opcional: interceptor Nest grava actions de mutação (depois).

---

## 9.9 Wave P4-B — Analytics totem (`totemAnalyticsStore`)

```
TotemClickEvent: id, storeId, productId, productName, createdAt
```

Endpoints:

- `POST /totem/analytics/clicks` **@Public** `{ productId, productName }` → loja seed  
- `GET /totem/analytics/summary` Bearer — ranking do dia + total (agregar no service)  

Cap ~2000 eventos por loja (podar antigos no insert).

---

## 10. Ordem de implementação (commits por onda)

### P0 (primeiro deploy)
1. `feat(db): sellers suppliers employees + access areas`  
2. `feat: registry CRUD + GET /me/access + seed`  
3. `feat: Nest totem/leads + pos/tickets (migrate Express)`  

### P1
4. `feat(db+api): finance-book accounts payables receivables treasury advances`  
5. `feat(db+api): warehouses lots kits warehouse-moves`  
6. `feat(db+api): stock-invoices post/cancel stock`  

### P2
7. `feat(db+api): cash sessions movements credits exchanges`  
8. `feat(db+api): fiscal classifications cfops fecps`  
9. `feat(db+api): fiscal issuer-settings + tax-tables`  

### P3
10. `feat(db+api): crm leads activities messages profiles`  
11. `feat(db+api): ecommerce channels listings orders stubs`  

### P4
12. `feat(db+api): audit log`  
13. `feat(db+api): totem analytics clicks + summary`  

**Mínimo da primeira entrega:** só **P0**.  
Após P0, o humano pede P1 no mesmo chat ou novo.

---

## 11. Seed Cell Ponto (por onda)

- **P0:** Sellers Bruno; Supplier CelSul; Employees Admin (`teste@marthi.com.br`) + Ana Costa  
- **P1:** Warehouses ALX-01 + ALX-BANC; Bank accounts Caixa loja + Conta operacional  
- **P2+:** tax tables seed mínimo; issuer settings defaults vazios/homologação  
- **Nunca** seedar CRM-MOCK / OS demo / ecommerce fake orders no banco  

---

## 12. Aceite

### P0
- [ ] CRUD sellers / suppliers / employees + `GET /me/access`  
- [ ] `POST /totem/leads` público → `PosTicket`  
- [ ] `GET/PATCH /pos/tickets`  
- [ ] `POST /pos/sales` com `ticketId` marca ticket `sold`  

### P1
- [ ] Finance-book completo (baixa parcial)  
- [ ] Warehouses / lots / kits / moves  
- [ ] Stock invoices draft → post ajusta estoque  

### P2
- [ ] Caixa: 1 sessão open/loja; aporte/sangria/close  
- [ ] Fiscal classifications / cfops / fecps  
- [ ] Issuer settings GET/PUT  
- [ ] Tax-tables GET + PUT/sync stub  

### P3
- [ ] CRM leads claim/move + activities  
- [ ] Ecommerce channel state + listings stubs  

### P4
- [ ] Audit GET/POST  
- [ ] Totem clicks público + summary autenticado  

### Geral (cada onda)
- [ ] Migration no START Discloud  
- [ ] Swagger  
- [ ] Lista de endpoints devolvida ao front  

---

## 13. Arquivos do Frontend para contrato

| Arquivo | Conteúdo |
|---|---|
| `apps/web/src/data/erpRegistry.ts` | Seller, Supplier, Employee, AccessArea |
| `apps/web/src/data/posQueueStore.ts` | QueueTicket |
| `apps/web/src/services/totem.ts` | body lead |
| `apps/web/src/services/pos.ts` | PosTicket API atual (Express) |
| `apps/web/src/data/financeBook.ts` | BankAccount, Payable, Receivable, Treasury, Advance |
| `apps/web/src/data/cashRegisterStore.ts` | CashSession, movements, credits, exchanges |
| `apps/web/src/data/fiscalCatalog.ts` | Warehouse, Lot, Kit, Move, FiscalClassification, Cfop, Fecp |
| `apps/web/src/data/invoiceStore.ts` | Invoice entrada/saída estoque |
| `apps/web/src/data/fiscalIssuerStore.ts` | Issuer settings + logs |
| `apps/web/src/data/fiscalTaxTables.ts` | CST / cClassTrib |
| `apps/web/src/data/crmStore.ts` | CrmLead, Activity, Message, Profile |
| `apps/web/src/data/ecommerceStore.ts` | Channel, Listing, Order |
| `apps/web/src/data/auditLog.ts` | AuditEntry |
| `apps/web/src/data/totemAnalyticsStore.ts` | TotemClickEvent |
| `docs/prompts/backend-fase2-erp-os-pdv.md` | contrato Fase 2 já entregue |

---

## 14. O que o agente do Backend deve fazer

1. Confirmar schema atual (Fase 2) e listar gap vs **a onda pedida**.  
2. Implementar **somente a onda** (`Implemente somente P0` etc.).  
3. Migration + seed da onda + módulos Nest (DTO + Swagger).  
4. Testar com curl o aceite da onda.  
5. **Não** SEFAZ/OAuth/`fiscalDocuments` real.  
6. Ao final da onda: endpoints prontos, migration name, próximo passo sugerido (P1…).

---

## 15. Resumo em uma frase

**Fase 3 = Nest/Prisma em ondas (P0→P4) para zerar mock operacional do painel — registry e fila totem primeiro; livro/invoices/almoxarifado; caixa e cadastro fiscal; CRM/e-com; audit/analytics — sem emissão SEFAZ nem OAuth.**