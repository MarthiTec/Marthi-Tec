# Arquitetura atual (nova stack)

```text
React Web (apps/web)
        │
        ▼
Node API (apps/api)  ──►  PostgreSQL (Discloud)
        ▲
React Native (futuro)
```

## Apps

### `apps/api`
- Express + TypeScript
- Escuta `0.0.0.0:8080` (exigência Discloud)
- `/health` — status + ping no Postgres
- `/api/v1/products` — placeholder (501) para o Thiago implementar

### `apps/web`
- React + Vite
- Tela inicial consome `/health`
- Proxy local para a API

### `packages/shared`
- Tipos `Product`, `ProductVariant`, `ApiResponse`

## Legado (ainda em produção)

Local: `C:\Marthi GIT` (Delphi Totem/Cadastros/API Horse + Firebird).  
Não misturar deploy do legado com este repositório.
