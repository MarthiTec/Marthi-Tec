import { useState } from 'react';
import type { SupplierEntry } from '../data/adminStore';
import { AdminPicker } from './AdminPicker';
import { CurrencyInput } from './CurrencyInput';
import { InlineSupplierCreate } from './InlineSupplierCreate';
import { filledImeis, ImeiListField } from './ImeiListField';
import { QuickModal } from './QuickModal';
import './supplierEntries.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Totais das entradas: unidades e custo médio ponderado. */
export function supplierEntriesSummary(entries: SupplierEntry[] | undefined) {
  const list = entries ?? [];
  const qty = list.reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
  const total = list.reduce((sum, entry) => sum + (Number(entry.qty) || 0) * (Number(entry.unitCost) || 0), 0);
  const suppliers = new Set(list.map((entry) => entry.supplierId || '—')).size;
  return { qty, avgCost: qty > 0 ? Math.round((total / qty) * 100) / 100 : 0, suppliers, count: list.length };
}

/** Texto curto para a célula da grade: "2 fornecedores · 3 un · 1 vendida". */
export function supplierEntriesLabel(entries: SupplierEntry[] | undefined) {
  const { qty, suppliers, count } = supplierEntriesSummary(entries);
  if (!count) return 'Nenhuma';
  const sold = (entries ?? []).reduce((sum, entry) => sum + (entry.soldQty ?? 0), 0);
  return `${suppliers} ${suppliers === 1 ? 'fornecedor' : 'fornecedores'} · ${qty} un${sold ? ` · ${sold} ${sold === 1 ? 'saiu' : 'saíram'}` : ''}`;
}

const dateTimeBr = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const OUT_LABEL: Record<string, string> = { sale: 'Vendido', bonus: 'Bonificação', internal: 'Uso interno', loss: 'Perda' };

/** Os IMEIs que já saíram ficam fora da caixa de texto (não somem da entrada: voltam no Aplicar). */
/** secondList: 2º IMEI (dual chip) de cada IMEI da caixa, na mesma posição. */
type Draft = SupplierEntry & { key: string; imeiList: string[]; secondList: string[]; outImeis: string[]; supplierOrigin: SupplierOrigin };

const PAYMENT_OPTIONS = [
  // Já pago primeiro: normalmente a loja paga o fornecedor para ele mandar o produto.
  { value: 'paid', label: 'Já pago (sai do caixa)' },
  { value: 'pending', label: 'A pagar (contas a pagar)' },
  { value: 'none', label: 'Não lançar no financeiro' },
];

export type SupplierOrigin = 'company' | 'upgrade';
export type SupplierOption = { id: string; name: string; origin?: SupplierOrigin };

export const SUPPLIER_ORIGIN_OPTIONS: Array<{ value: SupplierOrigin; label: string }> = [
  { value: 'company', label: 'Empresa' },
  { value: 'upgrade', label: 'Upgrade' },
];

const originOf = (suppliers: SupplierOption[], supplierId: string | undefined): SupplierOrigin =>
  suppliers.find((item) => item.id === supplierId)?.origin === 'upgrade' ? 'upgrade' : 'company';

const toDraft = (entry: SupplierEntry, index: number, suppliers: SupplierOption[]): Draft => {
  const outImeis = (entry.soldImeis ?? []).map((item) => item.imei);
  return {
    ...entry,
    key: entry.id || `new_${index}_${Date.now()}`,
    imeiList: (entry.imeis ?? []).filter((imei) => !outImeis.includes(imei)),
    secondList: (entry.imeis ?? []).filter((imei) => !outImeis.includes(imei)).map((imei) => entry.secondaryImeis?.[imei] ?? ''),
    outImeis,
    supplierOrigin: originOf(suppliers, entry.supplierId),
  };
};

/**
 * Entradas do mesmo produto (ou da variação) por fornecedor: cada compra com fornecedor, data,
 * quantidade, custo e IMEIs. O preço de venda não muda com o fornecedor.
 */
export function SupplierEntriesModal({
  title,
  entries,
  suppliers,
  defaultSupplierId,
  onClose,
  onApply,
  onSupplierCreated,
}: {
  title: string;
  entries: SupplierEntry[];
  suppliers: SupplierOption[];
  defaultSupplierId?: string;
  onClose: () => void;
  onApply: (entries: SupplierEntry[]) => void;
  /** Fornecedor cadastrado aqui dentro (já gravado no banco): a tela de trás atualiza a lista. */
  onSupplierCreated?: (supplier: SupplierOption) => void;
}) {
  // Fornecedores cadastrados nesta janela entram na lista na hora.
  const [created, setCreated] = useState<SupplierOption[]>([]);
  const allSuppliers = [...suppliers, ...created.filter((item) => !suppliers.some((s) => s.id === item.id))];
  const [rows, setRows] = useState<Draft[]>(() => entries.map((entry, index) => toDraft(entry, index, suppliers)));
  const [error, setError] = useState('');
  // Aparelhos que já saíram (venda, bonificação…) só aparecem quando o usuário pede.
  const [showOut, setShowOut] = useState(false);
  const anyOut = rows.some((row) => (row.soldQty ?? 0) > 0);
  // Grade por produto: cada entrada numa linha; só a que está sendo lançada ou editada abre o formulário.
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const update = (key: string, patch: Partial<Draft>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const add = () => {
    const draft = toDraft(
      { supplierId: defaultSupplierId ?? '', entryDate: today(), qty: 1, unitCost: rows[rows.length - 1]?.unitCost ?? 0, imeis: [], payment: 'paid' },
      rows.length,
      suppliers,
    );
    setRows((current) => [...current, draft]);
    setEditing(draft.key);
    setSearch('');
  };

  const parsed = rows.map((row) => {
    const typed = filledImeis(row.imeiList);
    // 2º IMEI: o dos aparelhos que já saíram fica como estava; o dos que estão na caixa vem do campo ao lado.
    const secondaryImeis: Record<string, string> = {};
    for (const imei of row.outImeis) if (row.secondaryImeis?.[imei]) secondaryImeis[imei] = row.secondaryImeis[imei];
    row.imeiList.forEach((imei, index) => {
      const second = (row.secondList[index] ?? '').trim();
      if (imei.trim() && second) secondaryImeis[imei.trim()] = second;
    });
    return { ...row, typed, secondaryImeis, imeis: [...row.outImeis, ...typed.filter((imei) => !row.outImeis.includes(imei))] };
  });
  const summary = supplierEntriesSummary(parsed);

  function apply() {
    // Com erro, abre a entrada que precisa de ajuste.
    const fail = (key: string, message: string) => {
      setEditing(key);
      setSearch('');
      setError(message);
    };
    for (const [index, row] of parsed.entries()) {
      if (!(Number(row.qty) > 0) || !Number.isInteger(Number(row.qty))) return fail(row.key, `Entrada ${index + 1}: informe a quantidade em unidades.`);
      if (row.imeis.length > Number(row.qty)) return fail(row.key, `Entrada ${index + 1}: há ${row.imeis.length} IMEIs para ${row.qty} unidade(s).`);
    }
    const all = parsed.flatMap((row) => [...row.imeis, ...Object.values(row.secondaryImeis)]);
    const dup = all.find((imei, index) => all.indexOf(imei) !== index);
    if (dup) return fail(parsed.filter((row) => row.imeis.includes(dup) || Object.values(row.secondaryImeis).includes(dup)).pop()!.key, `O IMEI ${dup} está repetido.`);
    onApply(
      parsed.map(({ key: _key, imeiList: _list, secondList: _second, typed: _typed, outImeis: _out, supplierName: _name, supplierOrigin: _origin, soldQty: _soldQty, soldImeis: _soldImeis, ...row }) => ({
        ...row,
        // Entrada nova sem escolha: já paga (o padrão da tela).
        payment: row.id ? row.payment : row.payment ?? 'paid',
        qty: Number(row.qty),
        unitCost: Number(row.unitCost) || 0,
      })),
    );
  }

  const supplierName = (row: Draft) =>
    row.origin === 'trade_in' ? `Troca · ${row.customerName || 'cliente'}` : allSuppliers.find((item) => item.id === row.supplierId)?.name || row.supplierName || 'O do produto';
  const term = search.trim().toLowerCase();
  const matches = (row: (typeof parsed)[number]) =>
    !term ||
    row.imeis.some((imei) => imei.includes(term)) ||
    [supplierName(row), row.notes ?? '', row.entryDate].some((text) => text.toLowerCase().includes(term));
  // Mais recentes primeiro; a entrada nova (ainda não aplicada) fica no topo.
  const ordered = parsed
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => matches(row) || row.key === editing)
    .sort((a, b) => Number(!b.row.id) - Number(!a.row.id) || String(b.row.entryDate).localeCompare(String(a.row.entryDate)) || b.index - a.index);

  const editor = (row: Draft, index: number) => (
    <fieldset className="supplier-entry">
      <legend>
        Entrada {index + 1}
        {row.soldQty ? (
          <span className="supplier-entry__sold-count">
            {Number(row.qty) - row.soldQty} em estoque · {row.soldQty} {row.soldQty === 1 ? 'saiu' : 'saíram'}
          </span>
        ) : null}
      </legend>
      <div className="supplier-entry__grid">
        {row.origin === 'trade_in' ? (
          <label className="admin-field">
            Origem
            <input value={`Troca · ${row.customerName || 'cliente'}`} disabled />
          </label>
        ) : (
          <>
            <AdminPicker
              label="Origem"
              value={row.supplierOrigin}
              options={SUPPLIER_ORIGIN_OPTIONS}
              onChange={(value) => {
                const supplierOrigin: SupplierOrigin = value === 'upgrade' ? 'upgrade' : 'company';
                update(row.key, { supplierOrigin, supplierId: originOf(allSuppliers, row.supplierId) === supplierOrigin ? row.supplierId : '' });
              }}
            />
            <div className="supplier-entry__supplier">
              <AdminPicker
                label="Fornecedor"
                value={row.supplierId}
                placeholder="O do produto"
                options={[
                  { value: '', label: 'O do produto (ou nenhum)' },
                  ...allSuppliers.filter((item) => (item.origin === 'upgrade' ? 'upgrade' : 'company') === row.supplierOrigin).map((item) => ({ value: item.id, label: item.name })),
                ]}
                onChange={(supplierId) => update(row.key, { supplierId })}
              />
              <InlineSupplierCreate
                origin={row.supplierOrigin}
                onCreated={(supplier) => {
                  setCreated((current) => [...current, supplier]);
                  update(row.key, { supplierId: supplier.id });
                  onSupplierCreated?.(supplier);
                }}
              />
            </div>
          </>
        )}
        <label className="admin-field">
          Data
          <input type="date" value={row.entryDate} max={today()} onChange={(e) => update(row.key, { entryDate: e.target.value })} />
        </label>
        <label className="admin-field">
          Quantidade
          <input type="number" min={1} step={1} value={row.qty} onChange={(e) => update(row.key, { qty: Number(e.target.value) })} />
        </label>
        <label className="admin-field">
          Custo unitário
          <CurrencyInput value={row.unitCost} ariaLabel="Custo unitário da entrada" onChange={(unitCost) => update(row.key, { unitCost })} />
        </label>
        <div className="admin-field supplier-entry__imeis">
          <ImeiListField
            label={`IMEIs em estoque (${parsed[index].typed.length})`}
            value={row.imeiList}
            secondary={row.secondList}
            onChange={(imeiList, secondList) => {
              // Cada IMEI é um aparelho: com mais IMEIs que unidades, a quantidade acompanha (o 2º IMEI não conta).
              const units = row.outImeis.length + filledImeis(imeiList).length;
              update(row.key, { imeiList, secondList, qty: Math.max(Number(row.qty) || 0, units) });
            }}
          />
        </div>
        {showOut && row.soldQty ? (
          <div className="supplier-entry__units">
            {(row.soldImeis ?? []).map((item) => (
              <span key={item.imei} className="supplier-entry__unit is-sold" title={item.saleId ? `Venda ${item.saleId}` : undefined}>
                {item.imei} · {OUT_LABEL[item.kind ?? 'sale'] ?? 'Saiu'} {dateTimeBr(item.soldAt)}
              </span>
            ))}
            {(row.soldQty ?? 0) - (row.soldImeis?.length ?? 0) > 0 ? (
              <span className="supplier-entry__unit is-sold">{(row.soldQty ?? 0) - (row.soldImeis?.length ?? 0)} un sem IMEI vendida(s)</span>
            ) : null}
          </div>
        ) : null}
        {!row.id && row.origin !== 'trade_in' ? (
          <>
            <AdminPicker
              label="Financeiro"
              value={row.payment ?? 'paid'}
              options={PAYMENT_OPTIONS}
              onChange={(value) => update(row.key, { payment: value === 'paid' || value === 'none' ? value : 'pending' })}
            />
            {(row.payment ?? 'paid') === 'pending' ? (
              <label className="admin-field">
                Vencimento
                <input type="date" value={row.dueDate || row.entryDate} onChange={(e) => update(row.key, { dueDate: e.target.value })} />
              </label>
            ) : null}
          </>
        ) : null}
        <label className="admin-field">
          Bateria (%)
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={row.batteryLevel ?? ''}
            placeholder="Usado: ex. 87"
            onChange={(e) => update(row.key, { batteryLevel: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
          />
        </label>
        <label className="admin-field supplier-entry__imeis">
          Observação
          <textarea rows={2} maxLength={500} value={row.notes ?? ''} placeholder="Ex.: troca de bateria, está no reparo com o João…" onChange={(e) => update(row.key, { notes: e.target.value })} />
        </label>
      </div>
      <button type="button" className="supplier-entry__close" onClick={() => setEditing(null)}>
        Concluir entrada
      </button>
    </fieldset>
  );

  return (
    <QuickModal
      className="supplier-entries-modal"
      title={title}
      subtitle="Cada compra com o fornecedor, a data, a quantidade, o custo e os IMEIs. O preço de venda continua o da variação."
      submitLabel="Aplicar"
      error={error}
      onClose={onClose}
      onSubmit={apply}
    >
      <div className="supplier-entries">
        <div className="supplier-entries__toolbar">
          <button type="button" className="quick-add-btn" onClick={add}>
            ＋ Entrada de fornecedor
          </button>
          {rows.length > 3 ? (
            <input
              className="supplier-entries__search"
              type="search"
              value={search}
              placeholder="Buscar IMEI, fornecedor, data ou observação"
              aria-label="Buscar entrada"
              onChange={(e) => setSearch(e.target.value)}
            />
          ) : null}
          {anyOut ? (
            <label className="supplier-entries__show-out">
              <input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} />
              Exibir aparelhos que já saíram
            </label>
          ) : null}
        </div>
        {summary.count ? (
          <p className="supplier-entries__summary">
            <strong>{summary.qty} un</strong> de {summary.suppliers} {summary.suppliers === 1 ? 'fornecedor' : 'fornecedores'} · custo médio <strong>{money(summary.avgCost)}</strong>
          </p>
        ) : null}
        {rows.length === 0 ? <p className="empty">Nenhuma entrada ainda. Use “+ Entrada de fornecedor”.</p> : null}
        {rows.length ? (
          <div className="supplier-entries__table" role="table" aria-label="Entradas do produto">
            <div className="supplier-entries__row supplier-entries__row--head" role="row">
              <span role="columnheader">Nº</span>
              <span role="columnheader">Data</span>
              <span role="columnheader">Origem / fornecedor</span>
              <span role="columnheader">Qtd</span>
              <span role="columnheader">Custo un.</span>
              <span role="columnheader">IMEIs</span>
              <span role="columnheader">Bateria</span>
              <span role="columnheader" aria-label="Ações" />
            </div>
            {ordered.length === 0 ? <p className="empty">Nenhuma entrada com “{search}”.</p> : null}
            {ordered.map(({ row, index }) => {
              const inStock = Number(row.qty) - (row.soldQty ?? 0);
              const open = editing === row.key;
              return (
                <div key={row.key} className={`supplier-entries__item${open ? ' is-open' : ''}`}>
                  <div className="supplier-entries__row" role="row" onClick={() => setEditing(open ? null : row.key)}>
                    <span role="cell" data-label="Nº">
                      {index + 1}
                      {!row.id ? <em className="supplier-entries__new">nova</em> : null}
                    </span>
                    <span role="cell" data-label="Data">{row.entryDate ? new Date(`${String(row.entryDate).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</span>
                    <span role="cell" data-label="Origem" className="supplier-entries__supplier" title={supplierName(row)}>
                      {supplierName(row)}
                    </span>
                    <span role="cell" data-label="Qtd">
                      {row.qty}
                      {row.soldQty ? <small> · {inStock} em estoque</small> : null}
                    </span>
                    <span role="cell" data-label="Custo un.">{money(Number(row.unitCost) || 0)}</span>
                    <span role="cell" data-label="IMEIs" className="supplier-entries__imei" title={row.imeis.join(', ')}>
                      {row.typed[0] ?? (row.imeis.length ? '—' : 'sem IMEI')}
                      {row.typed.length > 1 ? <small> +{row.typed.length - 1}</small> : null}
                    </span>
                    <span role="cell" data-label="Bateria">{row.batteryLevel != null ? `${row.batteryLevel}%` : '—'}</span>
                    <span role="cell" className="supplier-entries__actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => setEditing(open ? null : row.key)}>
                        {open ? 'Fechar' : 'Editar'}
                      </button>
                      {row.soldQty ? null : (
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => {
                            setRows((current) => current.filter((item) => item.key !== row.key));
                            if (open) setEditing(null);
                          }}
                        >
                          Remover
                        </button>
                      )}
                    </span>
                  </div>
                  {open ? editor(rows.find((item) => item.key === row.key)!, index) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </QuickModal>
  );
}
