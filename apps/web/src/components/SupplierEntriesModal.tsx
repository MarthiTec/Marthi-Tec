import { useState } from 'react';
import type { SupplierEntry } from '../data/adminStore';
import { AdminPicker } from './AdminPicker';
import { CurrencyInput } from './CurrencyInput';
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

/** Texto curto para a célula da grade: "2 fornecedores · 3 un". */
export function supplierEntriesLabel(entries: SupplierEntry[] | undefined) {
  const { qty, suppliers, count } = supplierEntriesSummary(entries);
  if (!count) return 'Nenhuma';
  return `${suppliers} ${suppliers === 1 ? 'fornecedor' : 'fornecedores'} · ${qty} un`;
}

type Draft = SupplierEntry & { key: string; imeisText: string; supplierOrigin: SupplierOrigin };

export type SupplierOrigin = 'company' | 'upgrade';
export type SupplierOption = { id: string; name: string; origin?: SupplierOrigin };

export const SUPPLIER_ORIGIN_OPTIONS: Array<{ value: SupplierOrigin; label: string }> = [
  { value: 'company', label: 'Empresa' },
  { value: 'upgrade', label: 'Upgrade' },
];

const originOf = (suppliers: SupplierOption[], supplierId: string | undefined): SupplierOrigin =>
  suppliers.find((item) => item.id === supplierId)?.origin === 'upgrade' ? 'upgrade' : 'company';

const toDraft = (entry: SupplierEntry, index: number, suppliers: SupplierOption[]): Draft => ({
  ...entry,
  key: entry.id || `new_${index}_${Date.now()}`,
  imeisText: (entry.imeis ?? []).join('\n'),
  supplierOrigin: originOf(suppliers, entry.supplierId),
});

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
}: {
  title: string;
  entries: SupplierEntry[];
  suppliers: SupplierOption[];
  defaultSupplierId?: string;
  onClose: () => void;
  onApply: (entries: SupplierEntry[]) => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() => entries.map((entry, index) => toDraft(entry, index, suppliers)));
  const [error, setError] = useState('');

  const update = (key: string, patch: Partial<Draft>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const add = () =>
    setRows((current) => [
      ...current,
      toDraft({ supplierId: defaultSupplierId ?? '', entryDate: today(), qty: 1, unitCost: current[current.length - 1]?.unitCost ?? 0, imeis: [] }, current.length, suppliers),
    ]);

  const parsed = rows.map((row) => ({ ...row, imeis: row.imeisText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean) }));
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
      parsed.map(({ key: _key, imeisText: _text, supplierName: _name, supplierOrigin: _origin, ...row }) => ({
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
        {rows.length === 0 ? <p className="empty">Nenhuma entrada ainda. Use “+ Entrada de fornecedor”.</p> : null}
        {rows.map((row, index) => (
          <fieldset key={row.key} className="supplier-entry">
            <legend>
              Entrada {index + 1}
              <button type="button" className="supplier-entry__remove" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                Remover
              </button>
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
                      update(row.key, { supplierOrigin, supplierId: originOf(suppliers, row.supplierId) === supplierOrigin ? row.supplierId : '' });
                    }}
                  />
                  <AdminPicker
                    label="Fornecedor"
                    value={row.supplierId}
                    placeholder="O do produto"
                    options={[
                      { value: '', label: 'O do produto (ou nenhum)' },
                      ...suppliers.filter((item) => (item.origin === 'upgrade' ? 'upgrade' : 'company') === row.supplierOrigin).map((item) => ({ value: item.id, label: item.name })),
                    ]}
                    onChange={(supplierId) => update(row.key, { supplierId })}
                  />
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
              <label className="admin-field supplier-entry__imeis">
                IMEIs ({parsed[index].imeis.length}/{Number(row.qty) || 0})
                <textarea rows={2} value={row.imeisText} placeholder="Um IMEI por linha (opcional)" onChange={(e) => update(row.key, { imeisText: e.target.value })} />
              </label>
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
