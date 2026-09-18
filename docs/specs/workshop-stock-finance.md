# Spec — OS + Estoque + Financeiro (oficina)

## Objetivo

Integrar ordem de serviço com estoque e financeiro no painel admin (MVP em `localStorage`), multi-segmento (celular, mecânica, TI):

1. Consumir peça na OS → baixa estoque + débito de custo
2. Comprar aparelho do cliente → entrada recondicionada + débito
3. Entregar OS / vender no PDV → crédito de receita

## Escopo

**In**

- Modelos: `StockItem.kind/condition`, `WorkOrder.lines`, `FinanceEntry.source/refId`
- Porta única: `apps/web/src/data/workshopLedger.ts`
- UI: detalhe da OS, filtros de estoque, extrato financeiro com link para OS

**Out**

- Backend Postgres / API
- NFe / CMV fiscal por competência
- Reserva de peça sem baixa (commit só na entrega)

## Eventos

| Evento | Função | Estoque | Financeiro |
|--------|--------|---------|------------|
| Consumir peça | `consumeStockOnWorkOrder` | `-qty` | `out` · `os_part` |
| Estornar peça | `removeWorkOrderLine` | `+qty` | `in` · `os_reversal` |
| Comprar recondicionado | `purchaseAssetFromWorkOrder` | `+1` refurbished | `out` · `os_purchase` |
| Entregar OS | `deliverWorkOrder` | — | `in` · `os_revenue` (labor + preço peças) |
| Cancelar OS | `cancelWorkOrderWithReversal` | estorna peças/compra | `os_reversal` |
| Venda PDV | `closePosSale` | `-qty` | `in` · `pos` |

**Regra:** débito de **custo** na ação; crédito de **receita** na entrega da OS (e no PDV).

## Dados

### `StockItem`

- `kind`: `part | device | supply`
- `condition`: `new | used | refurbished`
- `sourceWorkOrderId?`: OS que originou a compra

### `WorkOrder`

- `lines: WorkOrderLine[]` — `{ id, stockId, name, qty, unitCost, unitPrice, kind }`
- `parts` derivado das linhas `part` (compat legado)
- `assetDisposition`: `customer | purchased | scrapped`
- `purchaseCost`, `purchaseAt`, `purchaseStockId` quando comprado

### `FinanceEntry`

- `source`: `manual | pos | os_part | os_purchase | os_revenue | os_reversal`
- `refId`: id da OS ou pedido

## UI

- **OS detalhe:** buscar estoque → baixar; lista com estorno; destino do equipamento; comprar recondicionado; **Entregar · lançar receita**
- **Estoque:** filtros tipo/condição; badge “Recondicionado · OS-XXX”
- **Financeiro:** coluna origem + ref com link `/painel/os/:id`

## Aceite

- [ ] Baixar peça reduz qty e cria `out` com `source=os_part`
- [ ] Estornar peça devolve qty e lança `os_reversal`
- [ ] Comprar aparelho cria SKU refurbished ligado à OS
- [ ] Entregar OS lança `os_revenue` = labor + preço peças ao cliente
- [ ] PDV de recondicionado continua baixando estoque e creditando `pos`
- [ ] Filtros de estoque e extrato financeiro mostram origem/ref
