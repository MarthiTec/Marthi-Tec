# Arquitetura atual

```text
Browser (qualquer lugar)
        │
        ▼
https://marthi-totem.discloud.app   (Discloud Site · app marthi-totem)
        │
        ▼
Node API (apps/api)  ──► serve apps/web/dist (SPA)
        │
        ├── PostgreSQL MarthiDB (Discloud)   via DATABASE_URL
        └── Evolution (marthi-tec)          [WhatsApp / leads — app separado]
```

## Estágio comercial

- **1 cliente ativo:** Cell Ponto  
- **1 loja demo:** Loja Demonstração (no MarthiDB)  
- **Pipeline:** novos clientes em negociação  

Tenants (ativo, demo, futuros) são **registros no banco**, não mocks em runtime. Ver [decisions.md](decisions.md).

## Apps

### `apps/api`

- Express + TypeScript  
- Escuta `0.0.0.0:8080` (exigência Discloud)  
- `/health` — status + ping no Postgres  
- `/api/v1/*` — auth, ERP/estoque, PDV, OS, fiscal, CRM, planos, totem, lojas, …  
- Em produção serve o build de `apps/web/dist`  

### `apps/web`

- React + Vite  
- Home Marthi (planos, quem somos, segmentos)  
- Painel + módulos: ERP, PDV/caixa, OS, Fiscal, CRM, totem, e-commerce/food (conforme ramo)  
- Proxy local para a API no `vite` dev  

### `packages/shared`

- Tipos compartilhados de bootstrap (`Product`, `ApiResponse`, …)  
- Workspaces npm atuais: `apps/*`  

## Dados e multi-loja

- Isolamento por **`storeId`** (conta comercial pode ter várias lojas).  
- Conexão Postgres: **somente `DATABASE_URL`** (painel Discloud ou `.env`).  
- Dashboard banco: [MarthiDB](https://discloud.com/dashboard/databases/1789687025416db).  
- **Proibido:** mocks de runtime / hardcode de dados de negócio (clientes, lojas operacionais, etc.).  

## Deploy

| Item | Valor |
|---|---|
| Site dashboard | https://discloud.com/dashboard/app/marthi-totem |
| URL pública | https://marthi-totem.discloud.app |
| Config | `discloud.config` → `TYPE=site`, `ID=marthi-totem` |
| Skill | `.cursor/skills/discloud-marthi-deploy/` |
| Spec | `docs/specs/platform-public-site.md` |

## Superfície de produto (evidência no código)

| Módulo | Área típica |
|---|---|
| Painel | `/painel` |
| ERP | `/erp` |
| PDV | `/caixa` |
| OS | `/os` |
| Fiscal | `/fiscal` |
| CRM | `/crm` |
| Totem | `/totem` + home pública |

Limites do que está certificado em produção: [system-module-audit.md](system-module-audit.md).

## Legado (ainda em produção)

Local histórico: Delphi Totem/Cadastros/API Horse + Firebird (fora deste monorepo).  
Não misturar deploy do legado com este repositório.

## Backend Nest (alvo documentado)

`BACKEND_IMPLEMENTATION_SPEC.md` e `docs/specs/backend-nest-wiring.md` descrevem paridade Nest/Prisma (`marthi-backend`). Até cutover, o Site único acima é a arquitetura operacional deste repo.
