# Prompt Nest — o que implementar AGORA (frente ao front atual)

Cole este arquivo no chat do **Marthi-Backend**.  
Fonte: `apps/web` do Frontend (setembro/2026).  
Verificado ao vivo: `GET https://marthi-backend.discloud.app/health` → `database.connected: true`.  
`GET /api/v1/auth/providers` → OK.

---

## Contexto

O front **já chama Nest** só nestes caminhos:

| Cliente | Base | Endpoints |
|---|---|---|
| Nest | `VITE_API_URL` = `https://marthi-backend.discloud.app` | `/health`, `/api/v1/auth/*`, `POST /api/v1/partners/signup` |
| Express (Site totem) | mesma origem | totem leads, POS tickets |

Tudo do painel (clientes, estoque, OS, caixa, fiscal, e-commerce, CRM) continua em **localStorage**. **Não implemente esses CRUDs agora.**

---

## BLOQUEANTE — enums de plano/módulo (fazer primeiro)

O front **envia** valores novos. O Prisma Nest ainda tem os antigos → `POST /partners/signup` rejeita com 400.

### Trocar no `schema.prisma`

```prisma
enum PlanId {
  bronze
  silver
  golden
  @@map("plan_id")
}

enum ModuleId {
  totem
  os
  erp
  fiscal
  ecommerce
  @@map("module_id")
}
```

### Migration de dados (se já houver linhas)

| Antigo | Novo |
|---|---|
| `start` | `bronze` |
| `growth` | `silver` |
| `scale` | `golden` |
| `presales` | `erp` |

Aceitar no DTO (opcional, compat): receber `start|growth|scale|presales` e normalizar antes de gravar (igual ao front).

### Regras de validação (DTO partners)

| Plano | Módulos |
|---|---|
| `bronze` | exatamente **1** |
| `silver` | **1 ou 2** |
| `golden` | **todos os 5**: `totem`, `os`, `erp`, `fiscal`, `ecommerce` |

Atualizar:

1. `prisma/schema.prisma` + migration  
2. `partner-signup.dto.ts` (constraint de plano)  
3. Seed de `StoreEntitlement` → default `golden` + 5 módulos  
4. Mensagens de erro (não falar mais Start/Growth/Scale)

---

## Body exato de `POST /api/v1/partners/signup`

```ts
{
  planId: 'bronze' | 'silver' | 'golden';
  modules: Array<'totem' | 'os' | 'erp' | 'fiscal' | 'ecommerce'>;
  documentType: 'cnpj' | 'cpf';
  document: string;
  legalName: string;
  tradeName: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;      // pode ser ''
  district: string;
  city: string;
  state: string;           // UF 2 letras
  segment: string;         // pode ser ''
  contactName: string;
  contactRole: string;     // pode ser ''
  notes: string;           // pode ser ''
}
```

Resposta que o front lê:

```json
{ "success": true, "data": { "id": "PRT-XXXXXX" } }
```

(só `data.id` é usado na UI)

---

## Auth — manter contrato (já OK se providers/login funcionam)

| Método | Path | Body / header | `data` |
|---|---|---|---|
| GET | `/api/v1/auth/providers` | — | `{ google, password, googleClientId }` |
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ token, user }` |
| POST | `/api/v1/auth/google` | `{ idToken }` | `{ token, user }` |
| GET | `/api/v1/auth/me` | `Authorization: Bearer` | `{ user }` |

```ts
user: {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
}
```

Credenciais de aceite: `AUTH_DEV_EMAIL=teste@marthi.com.br` / `AUTH_DEV_PASSWORD=123`.

CORS: `https://marthi-totem.discloud.app`, `http://localhost:5173`.

---

## Health (já OK no ar)

`GET /health` (fora do prefix):

```ts
{
  service: string;
  status: 'ok' | 'degraded';
  time: string;
  database: { configured: boolean; connected: boolean; error: string | null };
}
```

---

## Próximo (Fase 1 restante — depois dos enums)

1. `GET /api/v1/products` com Bearer — contrato `packages/shared` `Product`  
   (front ainda **não** chama; wiring/docs pedem para aceite)  
2. Opcional: `GET /products/:id/variants`, `GET /products/:id/images`  
3. `GET /api/v1/partners/signup/pending` **com auth**

---

## NÃO implementar agora (só localStorage no front)

Não criar rotas/models extras para:

- Caixa (`cashRegisterStore`)  
- Fiscal / NF-e (`fiscal*`)  
- E-commerce marketplace (`ecommerceStore`)  
- CRM (`crmStore`)  
- Pessoas/ACL (`erpRegistry`, `auditLog`)  
- Finance book (`financeBook`)  
- CRUD clientes/estoque/OS/PDV venda  

Quando for sincronizar Prisma depois, o front **já tem campos a mais** nestes models (só para referência futura):

| Model Nest | Campos novos no front (ainda sem HTTP) |
|---|---|
| Customer | `zipCode`, `street`, `number`, `complement`, `neighborhood`, `state`, `active` |
| StockItem | `showOnTotem`, `images[]`, `supplierId?`, `fiscalClassificationId?`, `warehouseId?`, `trackLot?`, `isKit?` |
| SalesOrder | `customerDocument?`, `sellerId`, `sellerName` |
| WorkOrder | fotos, checklist, quote*, assinatura, marca/modelo/cor, etc. |
| TotemSettings | `exitPassword`, `shareStockWithErp` |
| StoreEntitlement | planos/módulos novos (já cobertos no BLOQUEANTE) |

---

## Totem / PDV (ainda Express)

Não migrar até o front trocar `edgeApiUrl()`. Quando migrar:

- `POST /api/v1/totem/leads` — incluir `attributes?: { id, name, value }[]`  
- `GET/PATCH /api/v1/pos/tickets`

---

## Checklist de aceite desta sprint

- [ ] Migration enums `bronze/silver/golden` + `totem/os/erp/fiscal/ecommerce`  
- [ ] Seed entitlement Golden = 5 módulos  
- [ ] `POST /partners/signup` com `planId: "bronze"` + 1 módulo → 201 + `id`  
- [ ] `POST /partners/signup` com `planId: "golden"` + 5 módulos → 201  
- [ ] `POST` com `presales` ou `start` → rejeitar **ou** normalizar  
- [ ] Login `teste@marthi.com.br` / `123` → JWT  
- [ ] `GET /health` → `database.connected: true` (já ok em produção)

---

## Ordem de commits sugerida

1. `fix: align PlanId/ModuleId enums with frontend bronze/silver/golden`  
2. `fix: partner signup validation for fiscal + ecommerce modules`  
3. `chore: seed StoreEntitlement golden with 5 modules`  
4. (depois) `feat: GET /products authenticated`

---

## Resposta esperada do agente

1. Confirmar enums atuais no schema.  
2. Aplicar migration + DTO + seed.  
3. Testar signup com curl/Postman.  
4. **Não** abrir PRs de fiscal/caixa/ERP CRUD nesta rodada.
