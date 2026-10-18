# Marthi Tec

Plataforma integrada Marthi Tecnologia: **ERP**, **PDV**, **OS** (oficina), **Fiscal**, **CRM** e **totem** de autoatendimento — **Node.js + React + PostgreSQL**.

Time: **Matheus Marçal** e **Thiago Barcelos**.

## Estágio comercial (atual)

| Situação | Detalhe |
|---|---|
| Cliente ativo | **Cell Ponto** (operação em produção) |
| Loja demo | **Loja Demonstração** — registrada no **MarthiDB** |
| Pipeline | Novos clientes em negociação (sem nomes inventados neste README) |

Cliente ativo, loja demo e futuros clientes existem como **registros no PostgreSQL**. Não usar mocks de runtime nem dados de negócio hardcoded.

## Stack

| Camada | Tecnologia |
|---|---|
| API | Node.js + Express + TypeScript (`apps/api`) |
| Web | React + Vite + TypeScript (`apps/web`) |
| Banco | PostgreSQL **MarthiDB** (Discloud) — conexão só via `DATABASE_URL` |
| Deploy | Discloud Site `marthi-totem` |
| Mobile | React Native (fase futura) |

## Infra Discloud

| Recurso | Onde |
|---|---|
| Site | App [`marthi-totem`](https://discloud.com/dashboard/app/marthi-totem) → `https://marthi-totem.discloud.app` |
| Banco | MarthiDB — [dashboard databases](https://discloud.com/dashboard/databases/1789687025416db) |
| Config | `discloud.config` (`TYPE=site`, `ID=marthi-totem`) |

Defina `DATABASE_URL` (e demais secrets) no painel do Site ou em `.env` local. **Nunca** commitá-los nem documentar senhas/connection strings.

## Estrutura

```text
apps/
  api/          → API REST (/api/v1)
  web/          → Painel + módulos (ERP, PDV, OS, Fiscal, CRM, totem, home)
packages/
  shared/       → Tipos compartilhados (bootstrap)
docs/           → Arquitetura, ADRs, manuais, specs, auditorias
```

Mapa detalhado: [`docs/architecture.md`](docs/architecture.md). Índice: [`docs/README.md`](docs/README.md).

## Setup local

1. Copie o ambiente:

```bash
cp .env.example .env
```

2. Preencha **`DATABASE_URL`** (e JWT/OAuth conforme `.env.example`) a partir do painel Discloud — sem colar secrets em docs ou commits.

3. Instale dependências (na raiz):

```bash
npm install
```

4. Suba a API e o Web (dois terminais):

```bash
npm run dev:api
npm run dev:web
```

- API: http://localhost:8080/health  
- Web: http://localhost:5173  

## Dados de negócio

- **Obrigatório:** persistir no MarthiDB (multi-loja por `storeId`).
- **Proibido daqui em diante:** mocks de runtime e hardcode de clientes/lojas/dados operacionais.
- Massa de teste automatizado usa bancos isolados (ex.: PGlite nos scripts) — não misturar com produção.

## Documentação

| Doc | Conteúdo |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Apps, deploy, fluxo Site |
| [`docs/decisions.md`](docs/decisions.md) | ADRs resumidos + constraints atuais |
| [`docs/GUIA_RAPIDO_COMECE_AQUI.md`](docs/GUIA_RAPIDO_COMECE_AQUI.md) | Primeiro dia do cliente |
| [`docs/MANUAL_COMPLETO_SISTEMA_MARTHI.md`](docs/MANUAL_COMPLETO_SISTEMA_MARTHI.md) | Manual operacional |
| [`docs/system-module-audit.md`](docs/system-module-audit.md) | Limites do que está certificado |
| [`.cursor/skills/discloud-marthi-deploy/`](.cursor/skills/discloud-marthi-deploy/) | Deploy/troubleshooting Discloud |

## Decisão de arquitetura

Backend mudou de PHP → **Node.js** (domínio do time). Ver [`docs/decisions.md`](docs/decisions.md).
