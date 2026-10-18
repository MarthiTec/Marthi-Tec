# Documentação Marthi Tec

Índice da pasta `docs/` do monorepo. Contexto durável do Project (Agent Store) vive fora do Git; este índice cobre o que está versionado aqui.

## Começar por aqui

| Doc | Para quê |
|---|---|
| [../README.md](../README.md) | Setup, estágio comercial, infra Discloud |
| [architecture.md](architecture.md) | Apps, Site `marthi-totem`, fluxo de deploy |
| [decisions.md](decisions.md) | Decisões + constraints (DB-only, sem mocks) |
| [GUIA_RAPIDO_COMECE_AQUI.md](GUIA_RAPIDO_COMECE_AQUI.md) | Primeiro acesso do cliente |
| [MANUAL_COMPLETO_SISTEMA_MARTHI.md](MANUAL_COMPLETO_SISTEMA_MARTHI.md) | Manual operacional completo |

## Estágio e infra (resumo)

- **Cliente ativo:** Cell Ponto  
- **Loja demo:** Loja Demonstração (registro no **MarthiDB**)  
- **Pipeline:** novos clientes em negociação  
- **Site:** [marthi-totem](https://discloud.com/dashboard/app/marthi-totem) → `https://marthi-totem.discloud.app`  
- **Banco:** MarthiDB ([dashboard](https://discloud.com/dashboard/databases/1789687025416db)) via **`DATABASE_URL` apenas**  
- **Regra:** sem mocks/hardcode de dados de negócio em runtime — tudo no DB  

Não documentar senhas ou connection strings.

## Arquitetura e ADRs

- [architecture.md](architecture.md)
- [decisions.md](decisions.md)
- [adr/0002-discloud-site-public-platform.md](adr/0002-discloud-site-public-platform.md)
- [adr/0003-workshop-stock-finance-ledger.md](adr/0003-workshop-stock-finance-ledger.md)
- [adr/0004-ui-ux-design-standards.md](adr/0004-ui-ux-design-standards.md)
- [database.md](database.md)
- [specs/](specs/) — platform-public-site, Nest wiring, UI, oficina/estoque

## Operação e implantação

- [CHECKLISTS_IMPLANTACAO_E_OPERACAO.md](CHECKLISTS_IMPLANTACAO_E_OPERACAO.md)
- [FAQ_PERGUNTAS_FREQUENTES.md](FAQ_PERGUNTAS_FREQUENTES.md)
- [security-hardening-rollout.md](security-hardening-rollout.md)

## Auditorias e histórico recente

- [system-module-audit.md](system-module-audit.md) — limites certificados  
- [cellponto-business-rule-review.md](cellponto-business-rule-review.md) — regras por ramo (opcional)  
- [operational-audit-2026-10-05.md](operational-audit-2026-10-05.md)  
- [RELATORIO_AUDITORIA_LANCAMENTO.md](RELATORIO_AUDITORIA_LANCAMENTO.md)  

## Backend alvo (Nest)

- [../BACKEND_IMPLEMENTATION_SPEC.md](../BACKEND_IMPLEMENTATION_SPEC.md)
- [prompts/](prompts/) — fases Nest/Prisma  
- [specs/backend-nest-wiring.md](specs/backend-nest-wiring.md)

O Site em produção neste repo continua sendo **Express (`apps/api`) + React (`apps/web`)** no mesmo processo Discloud, até cutover explícito.
