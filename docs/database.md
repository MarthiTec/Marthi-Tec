# Contrato de dados — backend e PostgreSQL

Fonte: tipos e telas de `apps/web` + rotas de `apps/api` (setembro/2026).  
Este arquivo é o dicionário para montar o banco e implementar a API. O Postgres hoje só executa `SELECT 1`. Quase todo o domínio operacional vive em `localStorage`.

Envelope obrigatório (já usado em todas as rotas):

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

Códigos já emitidos: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`.

Convenções:

- IDs públicos do frontend são `TEXT` com prefixo (`CLI-`, `STK-`, `PED-`, `FIN-`, `TAB-`, `PAY-`, `OS-`, `OL-`, `PDV-`, `ATTR-`, `PRT-`, `REC-`). Manter o mesmo formato na API para não quebrar a UI.
- Dinheiro: `NUMERIC(12,2)`, sempre positivo. Tipo da movimentação (`in`/`out`) define o sinal.
- Datas: ISO-8601 no JSON (`string`); `TIMESTAMPTZ` no banco.
- Multi-tenant real ainda é non-goal (`docs/specs/platform-public-site.md`). Mesmo assim crie `stores` com 1 linha seed (Cell Ponto) para não migrar depois.
- Campos **derivados** não viram coluna. Ver seção 8.

---

## 1. O que já existe vs o que falta

| Recurso | Onde está hoje | Persistência |
|---|---|---|
| Auth login/Google/`/me` | `apps/api` | JWT em memória; 1 usuário de env |
| Cadastro parceiro | `POST /api/v1/partners/signup` | array in-memory (cap 200) |
| Lead totem + fila PDV | `POST /api/v1/totem/leads`, `GET/PATCH /api/v1/pos/tickets` | in-memory + `localStorage` |
| Produtos / variantes / imagens | `GET /api/v1/products` | **501 stub** |
| Clientes, estoque, tabelas, pagamentos, pedidos, financeiro | painel `/painel/*` | `localStorage` `marthi.admin.v1` |
| Atributos | `/painel/atributos` | `marthi.attributes.v1` |
| OS + linhas | `/painel/os` | `marthi.os.v1` |
| Plano/módulos | `/painel/plano` | `marthi.store.plan` |
| Modo totem | `/painel/totem` | `marthi.totem.settings.v1` |
| Perfil operador | `/painel/perfil` | `marthi.operator.profile` |
| Catálogo do totem | `/totem` | hardcoded `totemData.ts` |

---

## 2. Enums (criar como `CREATE TYPE`)

| Tipo SQL | Valores | UI |
|---|---|---|
| `plan_id` | `start`, `growth`, `scale` | Start / Growth / Scale |
| `module_id` | `totem`, `presales`, `os`, `erp` | Totem / Pré-vendas / OS / ERP |
| `document_type` | `cnpj`, `cpf` | CNPJ / CPF |
| `auth_provider` | `google`, `password` | — |
| `product_status` | `active`, `inactive` | Ativo / Inativo |
| `stock_kind` | `part`, `device`, `supply` | Peça / Aparelho / Insumo |
| `stock_condition` | `new`, `used`, `refurbished` | Novo / Usado / Recondicionado |
| `payment_type` | `cash`, `pix`, `debit`, `credit`, `other` | Dinheiro / Pix / Débito / Crédito / Outro |
| `ticket_source` | `totem`, `manual` | — |
| `ticket_status` | `open`, `sold`, `cancelled` | Aberto / Vendido / Cancelado |
| `finance_type` | `in`, `out` | Entrada / Saída |
| `finance_source` | `manual`, `pos`, `os_part`, `os_purchase`, `os_revenue`, `os_reversal` | Manual / PDV / OS peça / OS compra / OS receita / OS estorno |
| `os_status` | `open`, `diagnosis`, `waiting`, `progress`, `ready`, `delivered`, `cancelled` | Aberta / Diagnóstico / Aguardando / Em serviço / Pronta / Entregue / Cancelada |
| `os_priority` | `low`, `normal`, `high` | Baixa / Normal / Alta |
| `asset_disposition` | `customer`, `purchased`, `scrapped` | Permanece do cliente / Comprado para estoque / Sucata |
| `os_line_kind` | `part`, `labor` | Peça / Mão de obra (UI só cria `part`; labor é coluna na OS) |
| `totem_mode` | `kiosk`, `catalog` | Quiosque de venda / Catálogo |
| `totem_payment` (texto livre no lead) | `À vista`, `Parcelado` | checkout do totem **não** usa `payment_methods` |
| `installment_label` (texto) | `2x`, `3x`, `6x`, `10x`, `12x` ou `NULL` | só se pagamento = Parcelado |

Regras de plano no cadastro de parceiro:

- Start: exatamente 1 módulo
- Growth: 1 ou 2 módulos
- Scale: obrigatório os 4 (`totem`, `presales`, `os`, `erp`)

---

## 3. Dicionário de campos (contrato do frontend)

PK sugerida = o `id` que a UI já gera. Todas as tabelas operacionais devem ter `store_id` (seed único no MVP).

### 3.1 `stores` — proposta (não existe na UI)

Nasce do cadastro `/parceiro` quando o lead for convertido. Seed: loja demo Cell Ponto / “Sua Loja”.

| Campo JSON | SQL | Obrigatório | Origem |
|---|---|---|---|
| `id` | `TEXT PK` | sim | gerado `STR-…` |
| `tradeName` | `trade_name TEXT` | sim | fantasia |
| `legalName` | `legal_name TEXT` | sim | razão / nome |
| `documentType` | `document_type` | sim | cnpj/cpf |
| `document` | `document TEXT` | sim | 11 ou 14 dígitos |
| `email` | `email TEXT` | sim | |
| `phone` | `phone TEXT` | sim | |
| `zipCode` | `zip_code TEXT` | sim | CEP 8 dígitos |
| `street` | `street TEXT` | sim | |
| `number` | `number TEXT` | sim | |
| `complement` | `complement TEXT` default `''` | não | |
| `district` | `district TEXT` | sim | |
| `city` | `city TEXT` | sim | |
| `state` | `state CHAR(2)` | sim | UF |
| `segment` | `segment TEXT` default `''` | não | |
| `createdAt` | `created_at TIMESTAMPTZ` | sim | |
| `updatedAt` | `updated_at TIMESTAMPTZ` | sim | |

### 3.2 `users` + sessão

`AuthUser` em `apps/api/src/services/authService.ts`.

| Campo JSON | SQL | Obrigatório | Notas |
|---|---|---|---|
| `id` | `TEXT PK` | sim | hoje `password:<email>` ou `google:<sub>` |
| `email` | `email TEXT UNIQUE` | sim | login |
| `name` | `name TEXT` | sim | |
| `picture` | `picture TEXT NULL` | não | URL Google |
| `provider` | `auth_provider` | sim | |
| — | `password_hash TEXT NULL` | se password | hoje senha em env `AUTH_DEV_PASSWORD` |
| — | `google_sub TEXT UNIQUE NULL` | se google | |
| — | `store_id TEXT FK` | sim no painel | |
| — | `created_at` / `last_login_at` | sim / não | |

Sessão (`AuthSession`): `{ token, user }` — JWT HS256, 7 dias, **não persistir** o token. Payload: `sub`, `email`, `name`, `picture`, `provider`.

Login body: `{ email, password }`. Google body: `{ idToken }`.  
`GET /api/v1/auth/providers` → `{ google, password, googleClientId }`.

### 3.3 `operator_profiles`

Tela `/painel/perfil`. Hoje 1 perfil por browser, **não** ligado a `user.id`.

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `displayName` | `display_name TEXT` | sim |
| `role` | `role TEXT` default `'Operador'` | sim — texto livre, **não** é RBAC da API |
| `photo` | `photo TEXT NULL` | JPEG data URL 256×256; migrar para storage depois |
| — | `user_id TEXT PK FK → users` | sim |

E-mail da conta é só leitura de `AuthUser.email`.

### 3.4 `store_entitlements`

Tela `/painel/plano`. Default se ausente: Scale + 4 módulos.

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `planId` | `plan_id` | sim |
| `modules` | `module_id[]` ou tabela `store_modules(store_id, module_id)` | sim, clampado ao plano |

Gating de rotas (`moduleForPath`):

| Prefixo | Módulo |
|---|---|
| `/totem`, `/painel/totem` | `totem` |
| `/painel/pdv`, `/painel/pedidos` | `presales` |
| `/painel/os` | `os` |
| `/painel/clientes`, `/estoque`, `/atributos`, `/tabelas`, `/pagamentos`, `/financeiro` | `erp` |

### 3.5 `totem_settings`

Tela `/painel/totem`.

| Campo JSON | SQL | Default |
|---|---|---|
| `mode` | `totem_mode` | `kiosk` |

`catalog` desliga o checkout do totem.

### 3.6 `partner_signups`

`POST /api/v1/partners/signup`. Persistência é responsabilidade do backend (comentário no route).

| Campo JSON | SQL | Obrigatório | Label UI |
|---|---|---|---|
| `id` | `TEXT PK` `PRT-…` | gerado | protocolo |
| `planId` | `plan_id` | sim | Qual plano |
| `modules` | `module_id[]` | sim | Totem / Pré-vendas / OS / ERP |
| `documentType` | `document_type` | sim | CNPJ / CPF |
| `document` | `TEXT` 11–18 | sim | |
| `legalName` | `TEXT` 2–180 | sim | Razão social / Nome completo |
| `tradeName` | `TEXT` 2–180 | sim | Nome fantasia |
| `email` | `TEXT` | sim | |
| `phone` | `TEXT` 8–20 | sim | Telefone / WhatsApp |
| `zipCode` | `TEXT` 8–9 | sim | CEP |
| `street` | `TEXT` 2–180 | sim | Logradouro |
| `number` | `TEXT` 1–20 | sim | Número |
| `complement` | `TEXT` ≤120 default `''` | não | Complemento |
| `district` | `TEXT` 2–120 | sim | Bairro |
| `city` | `TEXT` 2–120 | sim | Cidade |
| `state` | `CHAR(2)` | sim | UF |
| `segment` | `TEXT` ≤80 default `''` | não | Segmento |
| `contactName` | `TEXT` 2–120 | sim | Responsável |
| `contactRole` | `TEXT` ≤80 default `''` | não | Cargo |
| `notes` | `TEXT` ≤1000 default `''` | não | Observações |
| `createdAt` | `TIMESTAMPTZ` | gerado | |
| — | `status TEXT` sugerido `pending\|contacted\|converted` | sim | não existe na UI |

Resposta: `{ id, message }`. Lista admin atual (`GET /api/v1/partners/signup/pending`) devolve `{ count, items: [{ id, createdAt, planId, modules, tradeName, legalName, email, city, state }] }` **sem auth** — proteger.

### 3.7 Catálogo totem → `brands` + `products` + `product_images`

Hardcoded em `apps/web/src/pages/totem/totemData.ts`. Shared já esboça `Product` / `ProductVariant` (`packages/shared`). Endpoints Thiago: `GET /api/v1/products`, `/:id/variants`, `/:id/images`, `PATCH/PUT` preço.

`TotemProduct` (UI):

| Campo | TS | Persistir? |
|---|---|---|
| `id` | `number` (1–7, 19) | sim — pode virar TEXT/BIGINT |
| `name` | `string` | sim |
| `brand` | `'apple' \| 'xiaomi'` | FK `brands` |
| `storages` | `string[]` | valores do atributo `ATTR-CAP` |
| `colors` | `string[]` | valores do atributo `ATTR-COR` |
| `cashPrice` | `number` | preço à vista fallback se não achar estoque |
| `installmentLabel` | `string` | **não persistir** — derivar `12 X R$ …` |
| `images` | `string[]` | tabela `product_images` (`/totem/<slug>/n.svg`) |
| `attrs` | `Record<attrId, string[]>` | N:N produto × atributo × valor |

`Product` shared:

| Campo | TS |
|---|---|
| `id` | `number` |
| `name` | `string` |
| `brandId` | `number \| null` |
| `status` | `'active' \| 'inactive'` |
| `reference` | `string \| null` |
| `createdAt` | `string` |
| `updatedAt` | `string \| null` |

`ProductVariant` shared (SKU — substitui CELL_ITENS):

| Campo | TS |
|---|---|
| `id` | `number` |
| `productId` | `number` |
| `unitPrice` | `number` |
| `installmentPrice` | `number \| null` |
| `attributes` | `Record<string, string \| number>` |

No painel, o **estoque já é o SKU** (`StockItem`). Recomendação: `stock_items` referencia `product_id` (opcional no MVP) e carrega `attrs`; variantes do totem = combinação produto + attrs, cotadas contra estoque pelo **nome + atributos** (`variantQuote.ts`).

`VariantQuote` **nunca persistir**: `{ stock, cashPrice, qty, installmentLabel }`.  
Preço totem = `stock.price` (ou `cashPrice`) + `priceDeltas` dos atributos **não** usados no estoque (ex.: +250 “Por encomenda”).

Seed atual do totem (para popular `products`):

| id | name | brand | storages | colors | cashPrice |
|---|---|---|---|---|---|
| 1 | iPhone 16 Pro Max | apple | 256 GB, 512 GB | Desert, Preto, Branco, Natural | 6990 |
| 2 | iPhone 16 Pro | apple | 128 GB, 256 GB | Preto, Branco, Desert | 6290 |
| 3 | iPhone 15 | apple | 128 GB, 256 GB | Preto, Azul, Rosa | 4499 |
| 4 | iPhone 14 | apple | 128 GB, 256 GB | Preto, Azul, Roxo | 3899 |
| 5 | iPhone 13 | apple | 128 GB, 256 GB | Preto, Branco, Azul | 3400 |
| 6 | iPhone 12 | apple | 64 GB, 128 GB | Preto, Branco, Azul | 2799 |
| 7 | iPhone 11 | apple | 64 GB, 128 GB | Preto, Branco, Vermelho | 2299 |
| 19 | Redmi Note 13 Pro | xiaomi | 256 GB, 512 GB | Preto, Verde, Roxo | 2199 |

### 3.8 `product_attributes` + valores

Tela `/painel/atributos`. Máx. 5 atributos (`MAX_ATTRIBUTES`). IDs conhecidos: `ATTR-COR`, `ATTR-CAP`, `ATTR-RET`.

| Campo JSON | SQL | Obrigatório | Label |
|---|---|---|---|
| `id` | `TEXT PK` `ATTR-…` | sim | |
| `name` | `TEXT` | sim | Atributo |
| `values` | tabela filha | ≥1 para salvar | Valor |
| `priceDeltas` | `NUMERIC` na filha, chave = valor | sim | Ajuste de preço |
| `useOnTotem` | `BOOLEAN` | sim | Usar no totem |
| `filterOnTotem` | `BOOLEAN` | sim | Filtro no totem |
| `useOnStock` | `BOOLEAN` | sim | Usar no estoque |
| `sort` | `INT` | sim | |
| `active` | `BOOLEAN` | sim | Situação |

Filha `product_attribute_values`: `id`, `attribute_id`, `value TEXT`, `price_delta NUMERIC(12,2) DEFAULT 0`, `sort INT`.

`PickedAttribute` (embutido em ticket/lead, não é cadastro): `{ id, name, value }`.

Seed:

- Cor: Desert, Preto, Branco, Natural, Azul, Rosa, Roxo, Verde, Vermelho — deltas `{}`
- Capacidade: 64 GB, 128 GB, 256 GB, 512 GB — deltas `{}`
- Retirada: Pronta entrega (0), Por encomenda (250) — `useOnStock: false`, `filterOnTotem: false`

### 3.9 `customers`

Tela `/painel/clientes`. Upsert no fechamento do PDV pela **chave telefone (só dígitos)**. OS/PDV copiam nome/telefone — **não há `customerId` hoje**; incluir FK opcional.

| Campo JSON | SQL | Obrigatório | Label |
|---|---|---|---|
| `id` | `TEXT PK` `CLI-…` | gerado | |
| `name` | `TEXT` | sim | Nome |
| `phone` | `TEXT` | sim, ≥8 dígitos | Telefone — unique por loja (normalizado) |
| `document` | `TEXT` default `''` | não | CPF / CNPJ |
| `email` | `TEXT` default `''` | não | E-mail |
| `city` | `TEXT` default `''` | não | Cidade |
| `createdAt` | `TIMESTAMPTZ` | gerado | |

### 3.10 `stock_items`

Tela `/painel/estoque`. Lookup: sku / barcode / imei / id (exato) ou nome único (substring).

| Campo JSON | SQL | Obrigatório | Label |
|---|---|---|---|
| `id` | `TEXT PK` `STK-…` | gerado | |
| `name` | `TEXT` | sim | Produto — chave de match com totem |
| `sku` | `TEXT` default `''` | não | SKU |
| `barcode` | `TEXT` default `''` | não | Código de barras |
| `imei` | `TEXT` default `''` | não | limpo após venda daquele IMEI |
| `color` | `TEXT` | legado | **espelho** de `attrs[ATTR-COR]` — não precisa de coluna nova se `attrs` for canônico |
| `capacity` | `TEXT` | legado | espelho de `attrs[ATTR-CAP]` |
| `attrs` | tabela `stock_item_attributes(stock_id, attribute_id, value)` | `{}` | selects dinâmicos |
| `qty` | `INT NOT NULL` | sim | Quantidade |
| `minQty` | `INT NOT NULL` | sim | Mínimo |
| `cost` | `NUMERIC(12,2)` | sim | Custo |
| `price` | `NUMERIC(12,2)` | sim | Preço (à vista base) |
| `kind` | `stock_kind` | sim | Tipo |
| `condition` | `stock_condition` default `new` | sim | Condição |
| `sourceWorkOrderId` | `TEXT FK → work_orders NULL` | não | OS que gerou recondicionado |

OS compra cria: `kind=device`, `condition=refurbished`, `qty=1`, `minQty=0`, `price = input.price ?? round(cost * 1.35, 2)`, `sku = REC-<osSuffix>-<4>` ou informado, `imei` = input ou 15 dígitos de `itemRef`.

Não persistir: flag “abaixo do mínimo” (`qty <= minQty`), texto “Variação”.

### 3.11 `price_tables`

`/painel/tabelas`.

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `id` | `TEXT PK` `TAB-…` | sim |
| `name` | `TEXT` | sim |
| `percent` | `NUMERIC(6,2)` | sim (pode ser negativo) |
| `active` | `BOOLEAN` | sim |

Seed: Vista 0%, Atacado −8%, Cartão +5%.  
**Não persistir** preço já ajustado: `round(base * (1 + percent/100), 2)`.

### 3.12 `payment_methods`

`/painel/pagamentos`.

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `id` | `TEXT PK` `PAY-…` | sim |
| `name` | `TEXT` | sim |
| `type` | `payment_type` | sim |
| `priceTableId` | `TEXT FK → price_tables` | sim |
| `maxInstallments` | `INT ≥ 1` | sim |
| `active` | `BOOLEAN` | sim |

Seed: Dinheiro/Pix/Débito → `TAB-VISTA` 1x; Cartão de crédito → `TAB-CARTAO` 12x.

### 3.13 `pos_tickets` (fila) + lead totem

Criado em `/totem`; listado em `/painel/pdv`. API já tem o tipo **sem** `attributes[]` — o web **envia** `attributes`. Incluir.

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `id` | `TEXT PK` `PDV-<base36 time>` | gerado |
| `source` | `ticket_source` | sim (UI sempre `totem`) |
| `status` | `ticket_status` | sim, default `open` |
| `customerName` | `TEXT` min 2 | sim — “Digite seu nome e sobrenome” |
| `customerPhone` | `TEXT` min 8 | sim — “Digite seu telefone com DDD” |
| `productName` | `TEXT` | sim |
| `attributes` | filha `{ attribute_id, name, value }` | não no Zod atual — **adicionar** |
| `color` | `TEXT` | legado, preenchido via `toLegacyFields` |
| `storage` | `TEXT` | legado (capacidade) |
| `fulfillment` | `TEXT` | legado (retirada) |
| `payment` | `TEXT` | `À vista` / `Parcelado` |
| `installment` | `TEXT NULL` | `2x`…`12x` se parcelado |
| `priceLabel` | `TEXT` | display `"R$ 6.990,00"` — snapshot |
| `createdAt` | `TIMESTAMPTZ` | gerado |
| `closedAt` | `TIMESTAMPTZ NULL` | setado se status ≠ `open` |

Lead WhatsApp (Evolution) usa os mesmos campos + `TOTEM_LOCATION_LABEL`. Resposta: `{ message, customerNotified, ticketId }`.

PATCH body: `{ status: 'open' \| 'sold' \| 'cancelled' }`. Fechar como `sold` também gera `sales_order` + `finance` `pos`.

### 3.14 `sales_orders` + linhas

Criado só em `closePosSale` / `closeSale`. Lista `/painel/pedidos`. Sem tela de edição.

O que a UI **grava** hoje:

| Campo JSON | SQL | Obrigatório |
|---|---|---|
| `id` | `TEXT PK` `PED-…` | gerado |
| `ticketId` | `TEXT FK NULL` | totem ou `null` (balcão) |
| `customerName` | `TEXT` | default `'Consumidor'` |
| `productName` | `TEXT` | resumo `"1x iPhone 15, 2x capa"` |
| `amount` | `NUMERIC(12,2)` | total final |
| `status` | `ticket_status` | PDV sempre grava `sold` |
| `payment` | `TEXT` | `"Dinheiro · Vista"` (denormalizado) |
| `createdAt` | `TIMESTAMPTZ` | |

O que a UI **usa no close e some** — **criar colunas/tabelas**:

| Campo | SQL | Notas |
|---|---|---|
| `customerPhone` | `TEXT` | upsert cliente |
| `customerId` | `TEXT FK NULL` | |
| `discount` | `NUMERIC(12,2) DEFAULT 0` | |
| `surcharge` | `NUMERIC(12,2) DEFAULT 0` | |
| `paymentMethodId` | `TEXT FK NULL` | |
| `priceTableId` | `TEXT FK NULL` | |
| `priceTableName` | snapshot TEXT | |
| `installments` | `INT NULL` | |

`sales_order_lines`:

| Campo JSON (`PosLineInput`) | SQL |
|---|---|
| `stockId` | `TEXT FK NULL` (vazio se match por nome) |
| `name` | `TEXT` snapshot |
| `qty` | `INT` |
| `unitPrice` | `NUMERIC(12,2)` já com tabela aplicada |
| `imei` | `TEXT` |

`amount = max(0, Σ(unitPrice*qty) − discount + surcharge)`. Não persistir subtotal.

Efeitos colaterais na mesma transação: `stock.qty -= qty`; limpa IMEI se bate; upsert customer se telefone ≥8 dígitos; `finance_entries` `in` `source=pos` `refId=order.id`.

### 3.15 `finance_entries`

`/painel/financeiro` + ledger OS/PDV.

| Campo JSON | SQL | Obrigatório | Label |
|---|---|---|---|
| `id` | `TEXT PK` `FIN-…` | gerado | |
| `type` | `finance_type` | sim | Tipo |
| `label` | `TEXT` | sim | Descrição |
| `amount` | `NUMERIC(12,2)` **sempre > 0** | sim | Valor |
| `createdAt` | `TIMESTAMPTZ` | gerado | |
| `source` | `finance_source` default `manual` | sim | Origem |
| `refId` | `TEXT NULL` | não | `PED-…` ou `OS-…` |

Não persistir: `balance = Σ(in)−Σ(out)`, `inflow = Σ(in)`.

### 3.16 `work_orders` + `work_order_lines`

Telas `/painel/os`, `/nova`, `/:id`. Porta única de efeitos: `workshopLedger.ts` (ADR 0003). MVP atual é localStorage; no Postgres os eventos **precisam ser transacionais**.

`WorkOrder`:

| Campo JSON | SQL | Obrigatório | Label criação |
|---|---|---|---|
| `id` | `TEXT PK` `OS-XXXXX` | gerado | |
| `customerName` | `TEXT` | sim | Nome do cliente |
| `customerPhone` | `TEXT` default `''` | não | Telefone |
| — | `customer_id TEXT FK NULL` | sugerido | Cliente cadastrado |
| `itemName` | `TEXT` | sim | Item / equipamento |
| `itemRef` | `TEXT` default `''` | não | Referência (IMEI/série) |
| `defect` | `TEXT` | sim | Defeito relatado |
| `notes` | `TEXT` default `''` | não | Observações |
| `technician` | `TEXT` default `''` | não | Técnico (texto livre, sem FK user) |
| `priority` | `os_priority` default `normal` | sim | Prioridade |
| `status` | `os_status` default `open` | sim | |
| `labor` | `NUMERIC(12,2)` | sim | Mão de obra (R$) |
| `parts` | `NUMERIC(12,2)` | legado | **derivar** das linhas `part` |
| `lines` | tabela filha | sim `[]` | |
| `assetDisposition` | `asset_disposition` default `customer` | sim | Destino |
| `purchaseCost` | `NUMERIC NULL` | se comprado | Custo pago |
| `purchaseAt` | `TIMESTAMPTZ NULL` | se comprado | |
| `purchaseStockId` | `TEXT FK NULL` | se comprado | |
| `purchaseFinanceId` | `TEXT FK NULL` | se comprado | |
| `revenueFinanceId` | `TEXT FK NULL` | na entrega | |
| `createdAt` / `updatedAt` | `TIMESTAMPTZ` | gerado | |

Colunas do board (não inclui delivered/cancelled): `open`, `diagnosis`, `waiting`, `progress`, `ready`.

`WorkOrderLine` (`OL-XXXXX`):

| Campo JSON | SQL |
|---|---|
| `id` | `TEXT PK` |
| `stockId` | `TEXT FK NULL` |
| `name` | `TEXT` snapshot |
| `qty` | `INT` |
| `unitCost` | `NUMERIC(12,2)` custo no consumo |
| `unitPrice` | `NUMERIC(12,2)` preço ao cliente |
| `kind` | `os_line_kind` |
| `financeId` | `TEXT FK NULL` lançamento `os_part` |

Não persistir como fonte da verdade: `partsTotalFromLines`, `workOrderTotal = labor + parts`, campo UI “Peças ao cliente (R$)”.

---

## 4. Relacionamentos

```
stores 1—* users, partner_signups, customers, products, stock_items,
           price_tables, payment_methods, pos_tickets, sales_orders,
           finance_entries, work_orders, product_attributes
stores 1—1 store_entitlements, totem_settings

users 1—0..1 operator_profiles

brands 1—* products
products 1—* product_images
products *—* product_attribute_values          (valores permitidos no totem)
product_attributes 1—* product_attribute_values
product_attributes 1—* stock_item_attributes

price_tables 1—* payment_methods
customers 1—* work_orders, sales_orders, pos_tickets   (FK opcional; hoje denorm nome/fone)

pos_tickets 0..1—* sales_orders                 (ticket_id)
sales_orders 1—* sales_order_lines → stock_items
sales_orders 1—* finance_entries (source=pos, ref_id)

work_orders 1—* work_order_lines → stock_items
work_order_lines.finance_id → finance_entries (os_part)
work_orders.purchase_stock_id → stock_items
work_orders.purchase_finance_id → finance_entries (os_purchase)
work_orders.revenue_finance_id → finance_entries (os_revenue)
stock_items.source_work_order_id → work_orders
```

---

## 5. DDL inicial (PostgreSQL)

Rodar nesta ordem. Ajuste `store_id` seed depois do primeiro insert.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE plan_id AS ENUM ('start', 'growth', 'scale');
CREATE TYPE module_id AS ENUM ('totem', 'presales', 'os', 'erp');
CREATE TYPE document_type AS ENUM ('cnpj', 'cpf');
CREATE TYPE auth_provider AS ENUM ('google', 'password');
CREATE TYPE product_status AS ENUM ('active', 'inactive');
CREATE TYPE stock_kind AS ENUM ('part', 'device', 'supply');
CREATE TYPE stock_condition AS ENUM ('new', 'used', 'refurbished');
CREATE TYPE payment_type AS ENUM ('cash', 'pix', 'debit', 'credit', 'other');
CREATE TYPE ticket_source AS ENUM ('totem', 'manual');
CREATE TYPE ticket_status AS ENUM ('open', 'sold', 'cancelled');
CREATE TYPE finance_type AS ENUM ('in', 'out');
CREATE TYPE finance_source AS ENUM (
  'manual', 'pos', 'os_part', 'os_purchase', 'os_revenue', 'os_reversal'
);
CREATE TYPE os_status AS ENUM (
  'open', 'diagnosis', 'waiting', 'progress', 'ready', 'delivered', 'cancelled'
);
CREATE TYPE os_priority AS ENUM ('low', 'normal', 'high');
CREATE TYPE asset_disposition AS ENUM ('customer', 'purchased', 'scrapped');
CREATE TYPE os_line_kind AS ENUM ('part', 'labor');
CREATE TYPE totem_mode AS ENUM ('kiosk', 'catalog');
CREATE TYPE signup_status AS ENUM ('pending', 'contacted', 'converted');

CREATE TABLE stores (
  id           TEXT PRIMARY KEY,
  trade_name   TEXT NOT NULL,
  legal_name   TEXT NOT NULL,
  document_type document_type NOT NULL,
  document     TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL,
  zip_code     TEXT NOT NULL,
  street       TEXT NOT NULL,
  number       TEXT NOT NULL,
  complement   TEXT NOT NULL DEFAULT '',
  district     TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        CHAR(2) NOT NULL,
  segment      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  picture        TEXT,
  provider       auth_provider NOT NULL,
  password_hash  TEXT,
  google_sub     TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE operator_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'Operador',
  photo        TEXT
);

CREATE TABLE store_entitlements (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  plan     plan_id NOT NULL,
  modules  module_id[] NOT NULL
);

CREATE TABLE totem_settings (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  mode     totem_mode NOT NULL DEFAULT 'kiosk'
);

CREATE TABLE partner_signups (
  id             TEXT PRIMARY KEY,
  plan           plan_id NOT NULL,
  modules        module_id[] NOT NULL,
  document_type  document_type NOT NULL,
  document       TEXT NOT NULL,
  legal_name     TEXT NOT NULL,
  trade_name     TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  zip_code       TEXT NOT NULL,
  street         TEXT NOT NULL,
  number         TEXT NOT NULL,
  complement     TEXT NOT NULL DEFAULT '',
  district       TEXT NOT NULL,
  city           TEXT NOT NULL,
  state          CHAR(2) NOT NULL,
  segment        TEXT NOT NULL DEFAULT '',
  contact_name   TEXT NOT NULL,
  contact_role   TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  status         signup_status NOT NULL DEFAULT 'pending',
  converted_store_id TEXT REFERENCES stores(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id   TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  brand_id    TEXT REFERENCES brands(id),
  name        TEXT NOT NULL,
  status      product_status NOT NULL DEFAULT 'active',
  reference   TEXT,
  cash_price  NUMERIC(12,2) NOT NULL,
  sort        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

CREATE TABLE product_images (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort       INT NOT NULL DEFAULT 0
);

CREATE TABLE product_attributes (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id),
  name             TEXT NOT NULL,
  use_on_totem     BOOLEAN NOT NULL DEFAULT true,
  filter_on_totem  BOOLEAN NOT NULL DEFAULT false,
  use_on_stock     BOOLEAN NOT NULL DEFAULT true,
  sort             INT NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE product_attribute_values (
  id           TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value        TEXT NOT NULL,
  price_delta  NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort         INT NOT NULL DEFAULT 0,
  UNIQUE (attribute_id, value)
);

CREATE TABLE product_allowed_values (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  value_id   TEXT NOT NULL REFERENCES product_attribute_values(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, value_id)
);

CREATE TABLE customers (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  document    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone_digits)
);

CREATE TABLE work_orders (
  id                   TEXT PRIMARY KEY,
  store_id             TEXT NOT NULL REFERENCES stores(id),
  customer_id          TEXT REFERENCES customers(id),
  customer_name        TEXT NOT NULL,
  customer_phone       TEXT NOT NULL DEFAULT '',
  item_name            TEXT NOT NULL,
  item_ref             TEXT NOT NULL DEFAULT '',
  defect               TEXT NOT NULL,
  notes                TEXT NOT NULL DEFAULT '',
  technician           TEXT NOT NULL DEFAULT '',
  priority             os_priority NOT NULL DEFAULT 'normal',
  status               os_status NOT NULL DEFAULT 'open',
  labor                NUMERIC(12,2) NOT NULL DEFAULT 0,
  asset_disposition    asset_disposition NOT NULL DEFAULT 'customer',
  purchase_cost        NUMERIC(12,2),
  purchase_at          TIMESTAMPTZ,
  purchase_stock_id    TEXT,
  purchase_finance_id  TEXT,
  revenue_finance_id   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_items (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  product_id            TEXT REFERENCES products(id),
  source_work_order_id  TEXT REFERENCES work_orders(id),
  name                  TEXT NOT NULL,
  sku                   TEXT NOT NULL DEFAULT '',
  barcode               TEXT NOT NULL DEFAULT '',
  imei                  TEXT NOT NULL DEFAULT '',
  qty                   INT NOT NULL DEFAULT 0,
  min_qty               INT NOT NULL DEFAULT 0,
  cost                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  price                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  kind                  stock_kind NOT NULL,
  condition             stock_condition NOT NULL DEFAULT 'new'
);

CREATE TABLE stock_item_attributes (
  stock_id     TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id),
  value        TEXT NOT NULL,
  PRIMARY KEY (stock_id, attribute_id)
);

CREATE TABLE price_tables (
  id       TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name     TEXT NOT NULL,
  percent  NUMERIC(6,2) NOT NULL DEFAULT 0,
  active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE payment_methods (
  id                 TEXT PRIMARY KEY,
  store_id           TEXT NOT NULL REFERENCES stores(id),
  name               TEXT NOT NULL,
  type               payment_type NOT NULL,
  price_table_id     TEXT NOT NULL REFERENCES price_tables(id),
  max_installments   INT NOT NULL CHECK (max_installments >= 1),
  active             BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE pos_tickets (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  source          ticket_source NOT NULL,
  status          ticket_status NOT NULL DEFAULT 'open',
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '',
  storage         TEXT NOT NULL DEFAULT '',
  fulfillment     TEXT NOT NULL DEFAULT '',
  payment         TEXT NOT NULL,
  installment     TEXT,
  price_label     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE TABLE pos_ticket_attributes (
  ticket_id    TEXT NOT NULL REFERENCES pos_tickets(id) ON DELETE CASCADE,
  attribute_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (ticket_id, attribute_id)
);

CREATE TABLE sales_orders (
  id                 TEXT PRIMARY KEY,
  store_id           TEXT NOT NULL REFERENCES stores(id),
  ticket_id          TEXT REFERENCES pos_tickets(id),
  customer_id        TEXT REFERENCES customers(id),
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT NOT NULL DEFAULT '',
  product_name       TEXT NOT NULL,
  amount             NUMERIC(12,2) NOT NULL,
  discount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  surcharge          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status             ticket_status NOT NULL,
  payment            TEXT NOT NULL,
  payment_method_id  TEXT REFERENCES payment_methods(id),
  price_table_id     TEXT REFERENCES price_tables(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales_order_lines (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  stock_id    TEXT REFERENCES stock_items(id),
  name        TEXT NOT NULL,
  qty         INT NOT NULL CHECK (qty > 0),
  unit_price  NUMERIC(12,2) NOT NULL,
  imei        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE finance_entries (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  type        finance_type NOT NULL,
  label       TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  source      finance_source NOT NULL DEFAULT 'manual',
  ref_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_order_lines (
  id          TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stock_id    TEXT REFERENCES stock_items(id),
  name        TEXT NOT NULL,
  qty         INT NOT NULL CHECK (qty > 0),
  unit_cost   NUMERIC(12,2) NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  kind        os_line_kind NOT NULL,
  finance_id  TEXT REFERENCES finance_entries(id)
);

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_purchase_stock_fk
    FOREIGN KEY (purchase_stock_id) REFERENCES stock_items(id),
  ADD CONSTRAINT work_orders_purchase_finance_fk
    FOREIGN KEY (purchase_finance_id) REFERENCES finance_entries(id),
  ADD CONSTRAINT work_orders_revenue_finance_fk
    FOREIGN KEY (revenue_finance_id) REFERENCES finance_entries(id);

CREATE INDEX idx_customers_store_phone ON customers(store_id, phone_digits);
CREATE INDEX idx_stock_store_name ON stock_items(store_id, name);
CREATE INDEX idx_stock_sku ON stock_items(store_id, sku);
CREATE INDEX idx_tickets_store_status ON pos_tickets(store_id, status);
CREATE INDEX idx_finance_store_created ON finance_entries(store_id, created_at DESC);
CREATE INDEX idx_os_store_status ON work_orders(store_id, status);
CREATE INDEX idx_orders_store_created ON sales_orders(store_id, created_at DESC);
```

FK circular `work_orders.purchase_stock_id` ↔ `stock_items.source_work_order_id`: inserir OS primeiro, depois stock, depois `UPDATE work_orders`.

---

## 6. Endpoints

Auth em **todas** as rotas de negócio (hoje só `/auth/me` exige Bearer). Totem lead e partner signup continuam públicos.

### Já existem (persistir de verdade)

| Método | Path | Body / query | `data` |
|---|---|---|---|
| GET | `/health` | — | `service, status, time, database{configured,connected,error}` |
| GET | `/api/v1/auth/providers` | — | `google, password, googleClientId` |
| POST | `/api/v1/auth/login` | `email, password` | `AuthSession` |
| POST | `/api/v1/auth/google` | `idToken` | `AuthSession` |
| GET | `/api/v1/auth/me` | Bearer | `{ user }` |
| POST | `/api/v1/totem/leads` | ver 3.13 + `attributes[]` | `{ message, customerNotified, ticketId }` |
| GET | `/api/v1/pos/tickets` | — | `{ open, items: PosTicket[] }` |
| PATCH | `/api/v1/pos/tickets/:id` | `{ status }` | `PosTicket` |
| POST | `/api/v1/partners/signup` | ver 3.6 | `{ id, message }` |
| GET | `/api/v1/partners/signup/pending` | auth admin | `{ count, items }` |
| GET | `/api/v1/products` | — | **501** → lista `Product[]` |

### A implementar (paridade com o painel)

CRUD JSON no mesmo envelope. Path sugerido `/api/v1/...`.

| Método | Path | Campos do body |
|---|---|---|
| GET/POST | `/products` | `name, brandId, status, reference, cashPrice` |
| GET | `/products/:id` | |
| GET | `/products/:id/variants` | derivado de stock/attrs |
| GET | `/products/:id/images` | |
| POST | `/products/:id/images` | `url, sort` |
| PATCH | `/products/:id` | preço (`cashPrice`) + regenerar parcelas na resposta |
| GET/POST/PATCH/DELETE | `/attributes` | ver 3.8 |
| GET/POST/PATCH/DELETE | `/customers` | ver 3.9 |
| GET/POST/PATCH/DELETE | `/stock` | ver 3.10 |
| GET | `/stock/lookup?code=` | sku/barcode/imei/id/nome |
| GET/POST/PATCH/DELETE | `/price-tables` | ver 3.11 |
| GET/POST/PATCH/DELETE | `/payments` | ver 3.12 |
| GET | `/orders` | lista pedidos |
| POST | `/pos/sales` | `closePosSale` (3.14) — transação |
| GET/POST | `/finance` | `{ type, amount, label }` manual |
| GET/POST | `/work-orders` | criação 3.16 |
| GET/PATCH | `/work-orders/:id` | status, labor, notes, technician, priority, disposition |
| POST | `/work-orders/:id/parts` | `{ stockId, qty, unitPrice? }` → ledger consume |
| DELETE | `/work-orders/:id/parts/:lineId` | estorno |
| POST | `/work-orders/:id/purchase` | `{ cost, price?, sku?, imei? }` |
| POST | `/work-orders/:id/deliver` | receita |
| POST | `/work-orders/:id/cancel` | reversão |
| GET/PUT | `/store/plan` | `{ planId, modules }` |
| GET/PUT | `/store/totem-settings` | `{ mode }` |
| GET/PUT | `/me/profile` | `{ displayName, role, photo }` |

---

## 7. Regras transacionais (oficina + PDV)

Porta de referência no frontend: `apps/web/src/data/workshopLedger.ts` e `closePosSale`.

| Evento | Estoque | Financeiro | Outros |
|---|---|---|---|
| Consumir peça | `qty − n` | `out` `os_part` = `cost * qty` | linha OS; bloqueado se delivered/cancelled; recusar se `qty` insuficiente |
| Estornar peça | `qty + n` | `in` `os_reversal` | remove linha; bloqueado se delivered |
| Comprar recondicionado | `+1` device refurbished | `out` `os_purchase` = custo | set `purchase*`; 1x por OS |
| Entregar OS | — | `in` `os_revenue` = `labor + Σ(unitPrice*qty)` se total>0 e ainda sem `revenueFinanceId` | status `delivered` |
| Cancelar OS | estorna peças; se comprado e qty≥1, apaga stock + estorna compra | `os_reversal` | **recusar** se já tem `revenueFinanceId` ou recondicionado já vendido |
| Venda PDV | `qty − n`; limpa IMEI | `in` `pos` = amount | cria pedido + upsert cliente |

Custo lança na ação; receita na entrega (OS) ou no PDV.

---

## 8. Não persistir (calcular na API)

- Preço com tabela: `round(base * (1 + percent/100), 2)`
- Subtotal / total do PDV
- Saldo e inflow do financeiro
- `WorkOrder.parts` quando existem linhas `part`; total da OS
- `ticketVariation` / `formatPicked` (`" · ".join(values)`)
- `VariantQuote` e `installmentLabel` (`n X R$ …`)
- Flag estoque baixo
- Contagens do dashboard (tickets abertos, vendidos, baixo estoque)
- `color` / `capacity` se `stock_item_attributes` for canônico (manter só como snapshot de migração)

Snapshots aceitáveis (histórico): `sales_orders.product_name`, `payment`, `customer_name`, `pos_tickets.price_label`, `name` nas linhas.

---

## 9. Ordem sugerida para o backend

1. Extensões + enums + `stores` seed + `users` de verdade (sair do usuário único de env)
2. JWT middleware em rotas de painel
3. `partner_signups` (já validado com Zod)
4. `products` + `brands` + `product_images` (destravar o 501) + `product_attributes`
5. `pos_tickets` + `attributes[]` no lead (fila deixa de morrer no restart)
6. `customers`, `stock_items`, `price_tables`, `payment_methods`
7. `POST /pos/sales` transacional
8. `work_orders` + ledger (mesmas regras da spec)
9. `store_entitlements` / totem settings / operator profile
10. Ligar o web aos endpoints (hoje o painel não chama a API, só totem/auth/partners/PDV tickets)

Env já prevista (`apps/api/src/config/env.ts`): `DATABASE_URL` ou `DB_HOST`+`DB_DATABASE`, `JWT_SECRET`, `AUTH_DEV_*`, `GOOGLE_CLIENT_ID`, `EVOLUTION_*`, `TOTEM_LOCATION_LABEL`.
