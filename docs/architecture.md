# Arquitetura atual (nova stack)

```text
Browser (qualquer lugar)
        │
        ▼
https://marthi-totem.discloud.app   (Discloud Site)
        │
        ▼
Node API (apps/api)  ──► serve apps/web/dist (SPA)
        │
        ├── PostgreSQL (Discloud)     [quando configurado]
        └── Evolution (marthi-tec)   [WhatsApp leads]
```

## Apps

### `apps/api`
- Express + TypeScript
- Escuta `0.0.0.0:8080` (exigência Discloud)
- `/health` — status + ping no Postgres
- `/api/v1/*` — auth, products, totem leads
- Em produção serve o build de `apps/web/dist`

### `apps/web`
- React + Vite
- Home Marthi (planos, quem somos, produtos, segmentos)
- Totem Cell Ponto + login da loja
- Proxy local para a API no `vite` dev

### `packages/shared`
- Tipos `Product`, `ProductVariant`, `ApiResponse`

## Deploy

- Site: `discloud.config` → `TYPE=site`, `ID=marthi-totem`
- Skill: `.cursor/skills/discloud-marthi-deploy/`
- Spec: `docs/specs/platform-public-site.md`

## Legado (ainda em produção)

Local: `C:\Marthi GIT` (Delphi Totem/Cadastros/API Horse + Firebird).  
Não misturar deploy do legado com este repositório.
