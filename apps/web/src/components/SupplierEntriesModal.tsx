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
type Draft = SupplierEntry & { key: string; imeiList: string[]; outImeis: string[]; supplierOrigin: SupplierOrigin };

const PAYMENT_OPTIONS = [
  { value: 'pending', label: 'A pagar (contas a pagar)' },
  { value: 'paid', label: 'Já pago (sai do caixa)' },
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

  const update = (key: string, patch: Partial<Draft>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const add = () =>
    setRows((current) => [
      ...current,
      toDraft({ supplierId: defaultSupplierId ?? '', entryDate: today(), qty: 1, unitCost: current[current.length - 1]?.unitCost ?? 0, imeis: [], payment: 'pending' }, current.length, suppliers),
    ]);

  const parsed = rows.map((row) => {
    const typed = filledImeis(row.imeiList);
    return { ...row, typed, imeis: [...row.outImeis, ...typed.filter((imei) => !row.outImeis.includes(imei))] };
  });
  const summary = supplierEntriesSummary(parsed);

  function apply() {
    for (const [index, row] of parsed.entries()) {
      if (!(Number(row.qty) > 0) || !Number.isInteger(Number(row.qty))) return setError(`Entrada ${index + 1}: informe a quantidade em unidades.`);
      if (row.imeis.length > Number(row.qty)) return setError(`Entrada ${index + 1}: há ${row.imeis.length} IMEIs para ${row.qty} unidade(s).`);
    }
    const all = parsed.flatMap((row) => row.imeis);
    const dup = all.find((imei, index) => all.indexOf(imei) !== index);
    if (dup) return setError(`O IMEI ${dup} está repetido.`);
    onApply(
      parsed.map(({ key: _key, imeiList: _list, typed: _typed, outImeis: _out, supplierName: _name, supplierOrigin: _origin, soldQty: _soldQty, soldImeis: _soldImeis, ...row }) => ({
        ...row,
        qty: Number(row.qty),
        unitCost: Number(row.unitCost) || 0,
      })),
    );
  }

  return (
    <QuickModal
      title={title}
      subtitle="Cada compra com o fornecedor, a data, a quantidade, o custo e os IMEIs. O preço de venda continua o da variação."
      submitLabel="Aplicar"
      error={error}
      onClose={onClose}
      onSubmit={apply}
    >
      <div className="supplier-entries">
        {anyOut ? (
          <label className="supplier-entries__show-out">
            <input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} />
            Exibir aparelhos que já saíram (vendidos, bonificação, uso interno)
          </label>
        ) : null}
        {rows.length === 0 ? <p className="empty">Nenhuma entrada ainda. Use “+ Entrada de fornecedor”.</p> : null}
        {rows.map((row, index) => (
          <fieldset key={row.key} className="supplier-entry">
            <legend>
              Entrada {index + 1}
              {row.soldQty ? (
                <span className="supplier-entry__sold-count">
                  {Number(row.qty) - row.soldQty} em estoque · {row.soldQty} {row.soldQty === 1 ? 'saiu' : 'saíram'}
                </span>
              ) : null}
              {row.soldQty ? null : (
                <button type="button" className="supplier-entry__remove" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                  Remover
                </button>
              )}
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
                  onChange={(imeiList) => {
                    // Cada IMEI é um aparelho: com mais IMEIs que unidades, a quantidade acompanha.
                    const units = row.outImeis.length + filledImeis(imeiList).length;
                    update(row.key, { imeiList, qty: Math.max(Number(row.qty) || 0, units) });
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
                    value={row.payment ?? 'pending'}
                    options={PAYMENT_OPTIONS}
                    onChange={(value) => update(row.key, { payment: value === 'paid' || value === 'none' ? value : 'pending' })}
                  />
                  {(row.payment ?? 'pending') === 'pending' ? (
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
          </fieldset>
        ))}
        <button type="button" className="quick-add-btn" onClick={add}>
          ＋ Entrada de fornecedor
        </button>
        {summary.count ? (
          <p className="supplier-entries__summary">
            <strong>{summary.qty} un</strong> de {summary.suppliers} {summary.suppliers === 1 ? 'fornecedor' : 'fornecedores'} · custo médio <strong>{money(summary.avgCost)}</strong>
          </p>
        ) : null}
      </div>
    </QuickModal>
  );
}
