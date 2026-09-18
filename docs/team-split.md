# Divisão de trabalho — Matheus × Thiago

Objetivo: deixar bases prontas para os dois avançarem em paralelo sem conflito.

## Matheus Marçal (agora / curto prazo)

- [x] Auditoria do legado Delphi/Firebird
- [x] Bootstrap monorepo Node + React
- [x] Healthcheck + conexão PostgreSQL
- [ ] Modelagem PostgreSQL genérica (proposta Fase 2)
- [ ] Documentação `docs/database.md` e `docs/migration.md`
- [ ] Configuração/estabilidade Discloud + variáveis
- [ ] Design system / UX do Totem (especificação)
- [ ] Scripts de migração Firebird → PostgreSQL

## Thiago Barcelos (pode começar já)

### API (`apps/api`)

- [ ] Implementar `GET /api/v1/products` (hoje retorna 501)
- [ ] `GET /api/v1/products/:id/variants`
- [ ] `GET /api/v1/products/:id/images`
- [ ] `PATCH/PUT` preço + regeneração de parcelas
- [ ] Auth (JWT) e middlewares de segurança
- [ ] Camada `services/` + `repositories/` (evitar SQL no controller)

Referência do legado Horse:
- `GET /produtos`
- `GET /produtos/itens/:IDProd`
- `GET /produtos/imagens/:IDProd`
- `POST /produtos/atualizapreco`

### Web (`apps/web`)

- [ ] Rotas: login, produtos, variantes, configurações
- [ ] CRUD visual de produtos (paridade com CadProdutos VCL)
- [ ] Client HTTP tipado usando `@marthi/shared`
- [ ] Estados de loading / erro / vazio

### Depois

- [ ] Totem (React, experiência touch separada)
- [ ] React Native (paridade do app Android)

## Como evitar conflito no Git

1. Trabalhar em branches: `feat/thiago-products`, `feat/matheus-database`, etc.
2. Não editar os mesmos arquivos sem alinhar (ex.: `apps/api/src/index.ts`).
3. Preferir criar arquivos novos em pastas próprias (`routes/`, `services/`, `pages/`).
4. Abrir PR pequeno para `main`.

## Contrato de resposta da API

```json
{
  "success": true,
  "data": {}
}
```

Erro:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": {}
  }
}
```
