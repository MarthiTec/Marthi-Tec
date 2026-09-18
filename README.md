# Marthi Tec

Plataforma moderna de autoatendimento — **Node.js + React + PostgreSQL + React Native (em breve)**.

Time: **Matheus Marçal** e **Thiago Barcelos**.

## Stack

| Camada | Tecnologia |
|---|---|
| API | Node.js + Express + TypeScript |
| Web Admin | React + Vite + TypeScript |
| Banco | PostgreSQL (Discloud) |
| Deploy API | Discloud (`discloud.config`) |
| Mobile | React Native (próxima fase) |

## Estrutura

```text
apps/
  api/          → API REST
  web/          → Painel React
packages/
  shared/       → Tipos compartilhados
docs/           → Arquitetura, decisões, divisão de tarefas
```

## Setup local

1. Copie o ambiente:

```bash
copy .env.example .env
```

2. Preencha as variáveis do PostgreSQL (painel Discloud).

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

## Discloud

- Arquivo `discloud.config` na raiz (sobe a **API**).
- Variáveis de ambiente no painel (nunca commitar `.env`).
- Ajuste o `ID` do subdomínio se necessário.

## Divisão do time

Ver [`docs/team-split.md`](docs/team-split.md).

## Decisão de arquitetura

Backend mudou de PHP → **Node.js** porque o Thiago tem mais domínio na stack.  
Ver [`docs/decisions.md`](docs/decisions.md).
