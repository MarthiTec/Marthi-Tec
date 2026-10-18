# Decisões de arquitetura

## 2026-10-18 — MarthiDB obrigatório; sem mocks de negócio em runtime

**Contexto:**  
Há um cliente ativo (Cell Ponto), uma loja de demonstração e pipeline de novos clientes. A plataforma roda no Site Discloud `marthi-totem` com PostgreSQL MarthiDB.

**Decisão tomada:**

1. Infra oficial: Site [`marthi-totem`](https://discloud.com/dashboard/app/marthi-totem); banco MarthiDB ([dashboard](https://discloud.com/dashboard/databases/1789687025416db)).
2. Conexão ao banco **somente** via env **`DATABASE_URL`** (painel / `.env`). Sem credenciais em documentação ou commits.
3. **Proibido** daqui em diante: mocks de runtime e dados de negócio hardcoded (clientes, lojas, massa operacional embutida).
4. **Obrigatório:** cliente ativo, loja demo e futuros clientes registrados no MarthiDB.

**Impactos:**

- Seeds/defaults no front ou API que simulem tenant real devem ser removidos/substituídos por leitura do DB (trabalho de código separado).
- Demos comerciais usam a loja demo **persistida**, isolada do cliente ativo.
- Testes automatizados podem usar Postgres isolado (ex.: PGlite); isso não autoriza mock de produção.

---

## 2026-09-17 — Backend em Node.js (não PHP)

**Contexto:**  
O plano original previa API PHP + React + PostgreSQL. O time é composto por Matheus Marçal e Thiago Barcelos. O Thiago tem mais domínio em Node.js.

**Alternativas consideradas:**
1. PHP (plano inicial)
2. Node.js + TypeScript
3. Misturar PHP e Node

**Decisão tomada:**  
API em **Node.js + Express + TypeScript**. Frontend **React**. Mobile futuro em **React Native**. Banco **PostgreSQL**.

**Motivo:**  
Produtividade do time, alinhamento com React/React Native e familiaridade do Thiago com Node.

**Impactos:**
- `discloud.config` inicia a API Node (porta 8080)
- Não instalar PHP/Composer para o backend
- Endpoints legados Delphi/Horse serão recriados em Node

---

## 2026-09-18 — Site público Discloud (`marthi-totem`)

Ver ADR completo: [adr/0002-discloud-site-public-platform.md](./adr/0002-discloud-site-public-platform.md).

**Resumo:** plataforma (home + totem + login) publicada como **Site** em `https://marthi-totem.discloud.app`, não como Bot. ZIP de upload deve incluir `dist/index.js`.
