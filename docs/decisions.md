# Decisões de arquitetura

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
