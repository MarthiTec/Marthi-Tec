# ADR 0003 — Ledger da oficina (OS ↔ estoque ↔ financeiro)

- **Status:** Accepted  
- **Date:** 2026-09-18  
- **Deciders:** MarthiTec (Matheus)

## Context

A OS tratava `labor` e `parts` como valores soltos, sem baixar estoque nem lançar caixa. O PDV já debitava estoque e creditava financeiro em `closePosSale`. Oficinas (celular, mecânica, TI) precisam do mesmo ciclo para peças consumidas e para compra de aparelho do cliente que vira recondicionado.

## Decision

1. Criar **`workshopLedger.ts`** como única porta dos eventos da oficina (consumir, comprar, entregar, estornar, cancelar).
2. Movimento **atômico no momento da ação** (não só no “Entregue”).
3. Separar **custo** (débito na baixa/compra) de **receita** (crédito na entrega da OS / venda PDV).
4. Estender `StockItem` com `kind` + `condition`, `WorkOrder` com `lines` + `assetDisposition`, `FinanceEntry` com `source` + `refId`.
5. Manter MVP em **localStorage** alinhado ao admin atual; Postgres fica fora deste ADR.

## Alternatives considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Só lançar financeiro na entrega | Esconde custo de peça em aberto e atrapalha caixa diário |
| Reserva sem baixa até entrega | Mais estado; deferido |
| CMV / NFe automático | Contabilidade fiscal fora do MVP |
| Lógica espalhada nas pages | Duplica regras e dificulta estorno |

## Consequences

**Positive**

- Fluxo claro e testável por evento
- Rastreio OS → estoque recondicionado → PDV
- Extrato com origem e link para a OS

**Negative / follow-ups**

- Estorno de OS já entregue exige lançamento manual
- Persistência local ainda sem sync multi-dispositivo
- `os_revenue` é um `source` extra além da lista mínima do plano inicial (necessário para separar receita de PDV)

## References

- `apps/web/src/data/workshopLedger.ts`
- `apps/web/src/data/osStore.ts`
- `apps/web/src/data/adminStore.ts`
- `docs/specs/workshop-stock-finance.md`
