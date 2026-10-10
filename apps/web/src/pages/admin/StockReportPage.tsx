import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { getAttributes, hydrateAttributesFromApi, type ProductAttribute } from '../../data/attributeStore';
import type { StockItem, StockVariationRow, SupplierEntry } from '../../data/adminStore';
import { findBrand, useBrands } from '../../data/brandStore';
import { getActiveStore, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { CONDITION_LABEL, conditionCode } from '../../data/productCondition';
import { apiListStock, apiListSuppliers } from '../../services/erpApi';
import { apiListProductGroups, type ProductGroup, type ProductGroupLabels } from '../../services/productCatalogApi';
import './stockReport.css';

/** Uma linha do relatório: um aparelho (ou uma variação, no modo agrupado). */
type ReportRow = {
  key: string;
  productId: string;
  name: string;
  image: string;
  brand: string;
  sku: string;
  groupId: string;
  subgroupId: string;
  attrs: Record<string, string>;
  condition: string;
  battery: number | null;
  imei: string;
  origin: string;
  supplierId: string;
  cost: number;
  price: number;
  entryDate: string;
  notes: string;
  qty: number;
  /** Aparelho já vendido (não está mais no estoque). */
  sold?: boolean;
};

type Mode = 'unit' | 'variation';
type SortKey = 'name' | 'entry-desc' | 'entry-asc' | 'price-desc' | 'price-asc' | 'cost-desc' | 'battery-desc' | 'battery-asc';
type Column = 'photo' | 'attrs' | 'condition' | 'battery' | 'imei' | 'status' | 'origin' | 'cost' | 'price' | 'entry' | 'notes' | 'sku' | 'qty';

const COLUMN_LABEL: Record<Column, string> = {
  photo: 'Foto',
  attrs: 'Atributos (cor, capacidade…)',
  condition: 'Condição',
  battery: 'Bateria',
  imei: 'IMEI',
  status: 'Situação (em estoque / vendido)',
  origin: 'Fornecedor / origem',
  cost: 'Valor de compra',
  price: 'Valor de venda',
  entry: 'Data de entrada',
  notes: 'Observação',
  sku: 'SKU',
  qty: 'Quantidade',
};
const DEFAULT_COLUMNS: Column[] = ['photo', 'attrs', 'condition', 'battery', 'imei', 'status', 'origin', 'cost', 'price', 'entry', 'notes', 'qty'];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'Produto (A–Z)' },
  { value: 'entry-desc', label: 'Entrada mais recente' },
  { value: 'entry-asc', label: 'Entrada mais antiga' },
  { value: 'price-desc', label: 'Maior valor de venda' },
  { value: 'price-asc', label: 'Menor valor de venda' },
  { value: 'cost-desc', label: 'Maior valor de compra' },
  { value: 'battery-desc', label: 'Maior bateria' },
  { value: 'battery-asc', label: 'Menor bateria' },
];

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const today = () => new Date().toISOString().slice(0, 10);

function entryOrigin(entry: SupplierEntry | undefined) {
  if (!entry) return '';
  if (entry.origin === 'trade_in') return `Troca · ${entry.customerName || 'cliente'}`;
  return entry.supplierName || '';
}

/**
 * Linhas por aparelho. Cada unidade das entradas está vendida quando a venda marcou o IMEI dela (ou,
 * sem IMEI, pela quantidade vendida da entrada). Vendas antigas, de antes da marca, contam como as
 * unidades mais antigas: só ficam em estoque as mais recentes até o saldo atual da variação.
 * O saldo que não tem entrada aparece com os dados da variação.
 */
function unitRows(product: StockItem, slot: { key: string; attrs: Record<string, string>; condition: string; battery: number | null; price: number; cost: number; qty: number; imei: string; entries: SupplierEntry[] }, base: Omit<ReportRow, 'key' | 'attrs' | 'condition' | 'battery' | 'imei' | 'origin' | 'supplierId' | 'cost' | 'price' | 'entryDate' | 'notes' | 'qty'>, includeSold: boolean) {
  const rows: ReportRow[] = [];
  let remaining = Math.max(0, Math.round(slot.qty));
  const entries = [...slot.entries].sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || ''));
  for (const entry of entries) {
    const soldImeis = new Set((entry.soldImeis ?? []).map((item) => item.imei));
    let soldWithoutImei = Math.max(0, (entry.soldQty ?? 0) - soldImeis.size);
    for (let i = 0; i < entry.qty; i += 1) {
      const imei = entry.imeis[i] ?? '';
      let sold = imei ? soldImeis.has(imei) : soldWithoutImei > 0;
      if (!imei && sold) soldWithoutImei -= 1;
      if (!sold && remaining <= 0) sold = true;
      if (!sold) remaining -= 1;
      if (sold && !includeSold) continue;
      rows.push({
        ...base,
        key: `${slot.key}:${entry.id ?? 'e'}:${i}`,
        attrs: slot.attrs,
        condition: slot.condition,
        battery: entry.batteryLevel ?? slot.battery,
        imei,
        origin: entryOrigin(entry),
        supplierId: entry.origin === 'trade_in' ? `customer:${entry.customerId ?? ''}` : entry.supplierId || product.supplierId || '',
        cost: Number(entry.unitCost) || 0,
        price: slot.price,
        entryDate: entry.entryDate || '',
        notes: entry.notes ?? '',
        qty: sold ? 0 : 1,
        sold,
      });
    }
  }
  for (let i = 0; i < remaining; i += 1) {
    rows.push({
      ...base,
      key: `${slot.key}:sem:${i}`,
      attrs: slot.attrs,
      condition: slot.condition,
      battery: slot.battery,
      imei: i === 0 ? slot.imei : '',
      origin: 'sem entrada',
      supplierId: product.supplierId || '',
      cost: slot.cost,
      price: slot.price,
      entryDate: product.entryDate || '',
      notes: '',
      qty: 1,
    });
  }
  return rows;
}

export function StockReportPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [groupLabels, setGroupLabels] = useState<ProductGroupLabels>({ group: 'Grupo', subgroup: 'Subgrupo' });
  const { brands } = useBrands();

  // Filtros e opções do relatório
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [groupId, setGroupId] = useState('');
  const [subgroupId, setSubgroupId] = useState('');
  const [origin, setOrigin] = useState('');
  const [condition, setCondition] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [mode, setMode] = useState<Mode>('unit');
  const [sort, setSort] = useState<SortKey>('name');
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      setError('');
      Promise.all([
        apiListStock(),
        apiListSuppliers().catch(() => []),
        apiListProductGroups().catch(() => ({ labels: { group: 'Grupo', subgroup: 'Subgrupo' }, groups: [] as ProductGroup[] })),
        hydrateAttributesFromApi().catch(() => undefined),
      ])
        .then(([stock, sup, grp]) => {
          if (!alive) return;
          setItems(Array.isArray(stock) ? stock : []);
          setSuppliers(sup.map((row) => ({ id: row.id, name: row.tradeName || row.name })));
          setGroups(grp.groups);
          setGroupLabels(grp.labels);
          setAttributes(getAttributes().filter((attr) => attr.active));
        })
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar o estoque.'))
        .finally(() => alive && setLoading(false));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, []);

  /** Atributos que aparecem em algum produto (viram colunas: Capacidade, Cor…). */
  const usedAttributes = useMemo(() => {
    const used = new Set<string>();
    for (const item of items) {
      for (const v of item.variations ?? []) for (const [id, value] of Object.entries(v.attrs ?? {})) if (value) used.add(id);
      for (const [id, value] of Object.entries(item.attrs ?? {})) if (typeof value === 'string' && value) used.add(id);
    }
    return attributes.filter((attr) => used.has(attr.id));
  }, [items, attributes]);

  const allRows = useMemo(() => {
    const rows: ReportRow[] = [];
    for (const item of items) {
      if (item.active === false) continue;
      const base = {
        productId: item.id,
        name: item.name,
        image: item.images?.[0] ?? '',
        brand: findBrand(brands, item.brand ?? '')?.name ?? item.brand ?? '',
        sku: item.sku,
        groupId: item.groupId ?? '',
        subgroupId: item.subgroupId ?? '',
      };
      const slots = item.variations?.length
        ? item.variations.map((v: StockVariationRow, index) => ({
            key: `${item.id}:${v.id ?? index}`,
            attrs: Object.fromEntries(Object.entries(v.attrs ?? {}).map(([k, val]) => [k, String(val ?? '')])),
            condition: conditionCode(v.condition) || 'new',
            battery: (conditionCode(v.condition) || 'new') === 'new' ? 100 : v.batteryLevel ?? null,
            price: Number(v.pickupMethodId ? v.pickupPrices?.[v.pickupMethodId] ?? v.price : v.price) || 0,
            cost: Number(v.cost) || 0,
            qty: Number(v.qty) || 0,
            imei: v.imei ?? '',
            entries: v.supplierEntries ?? [],
          }))
        : [
            {
              key: item.id,
              attrs: Object.fromEntries(Object.entries(item.attrs ?? {}).filter(([, val]) => typeof val === 'string').map(([k, val]) => [k, String(val)])),
              condition: conditionCode(item.condition) || 'new',
              battery: (conditionCode(item.condition) || 'new') === 'new' ? 100 : item.batteryLevel ?? null,
              price: Number(item.price) || 0,
              cost: Number(item.cost) || 0,
              qty: Number(item.qty) || 0,
              imei: item.imei ?? '',
              entries: item.supplierEntries ?? [],
            },
          ];
      for (const slot of slots) {
        if (mode === 'variation') {
          if (onlyInStock && slot.qty <= 0) continue;
          const latest = [...slot.entries].sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || ''))[0];
          rows.push({
            ...base,
            key: slot.key,
            attrs: slot.attrs,
            condition: slot.condition,
            battery: slot.battery,
            imei: [...new Set(slot.entries.flatMap((entry) => entry.imeis).concat(slot.imei ? [slot.imei] : []))].join(', '),
            origin: [...new Set(slot.entries.map(entryOrigin).filter(Boolean))].join(', ') || '—',
            supplierId: latest ? (latest.origin === 'trade_in' ? `customer:${latest.customerId ?? ''}` : latest.supplierId || item.supplierId || '') : item.supplierId || '',
            cost: slot.cost,
            price: slot.price,
            entryDate: latest?.entryDate || item.entryDate || '',
            notes: [...new Set(slot.entries.map((entry) => entry.notes).filter(Boolean))].join(' · '),
            qty: slot.qty,
          });
        } else {
          rows.push(...unitRows(item, slot, base, !onlyInStock));
          if (!onlyInStock && slot.qty <= 0) {
            rows.push({ ...base, key: `${slot.key}:zero`, attrs: slot.attrs, condition: slot.condition, battery: slot.battery, imei: '', origin: '—', supplierId: '', cost: slot.cost, price: slot.price, entryDate: '', notes: 'sem estoque', qty: 0 });
          }
        }
      }
    }
    return rows;
  }, [items, brands, mode, onlyInStock]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allRows.filter((row) => {
      if (q && !`${row.name} ${row.sku} ${row.imei} ${Object.values(row.attrs).join(' ')} ${row.origin} ${row.notes}`.toLowerCase().includes(q)) return false;
      if (brand && row.brand.toLowerCase() !== brand.toLowerCase()) return false;
      if (groupId && row.groupId !== groupId) return false;
      if (subgroupId && row.subgroupId !== subgroupId) return false;
      if (origin && row.supplierId !== origin && !(origin === 'trade_in' && row.supplierId.startsWith('customer:'))) return false;
      if (condition && row.condition !== condition) return false;
      if (from && (!row.entryDate || row.entryDate < from)) return false;
      if (to && (!row.entryDate || row.entryDate > to)) return false;
      return true;
    });
    const byName = (a: ReportRow, b: ReportRow) => a.name.localeCompare(b.name, 'pt-BR') || Object.values(a.attrs).join(' ').localeCompare(Object.values(b.attrs).join(' '), 'pt-BR');
    const sorters: Record<SortKey, (a: ReportRow, b: ReportRow) => number> = {
      name: byName,
      'entry-desc': (a, b) => (b.entryDate || '').localeCompare(a.entryDate || '') || byName(a, b),
      'entry-asc': (a, b) => (a.entryDate || '9999').localeCompare(b.entryDate || '9999') || byName(a, b),
      'price-desc': (a, b) => b.price - a.price || byName(a, b),
      'price-asc': (a, b) => a.price - b.price || byName(a, b),
      'cost-desc': (a, b) => b.cost - a.cost || byName(a, b),
      'battery-desc': (a, b) => (b.battery ?? -1) - (a.battery ?? -1) || byName(a, b),
      'battery-asc': (a, b) => (a.battery ?? 101) - (b.battery ?? 101) || byName(a, b),
    };
    return [...filtered].sort(sorters[sort]);
  }, [allRows, query, brand, groupId, subgroupId, origin, condition, from, to, sort]);

  const totals = useMemo(
    () => ({
      units: visible.reduce((sum, row) => sum + row.qty, 0),
      cost: visible.reduce((sum, row) => sum + row.cost * row.qty, 0),
      price: visible.reduce((sum, row) => sum + row.price * row.qty, 0),
    }),
    [visible],
  );

  const has = (column: Column) => columns.includes(column);
  const toggleColumn = (column: Column) =>
    setColumns((current) => (current.includes(column) ? current.filter((item) => item !== column) : [...current, column]));

  function print() {
    document.body.classList.add('is-printing-report');
    const done = () => {
      document.body.classList.remove('is-printing-report');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  const store = getActiveStore();
  const filtersText = [
    query && `Busca: ${query}`,
    brand && `Marca: ${brand}`,
    groupId && `${groupLabels.group}: ${groups.find((g) => g.id === groupId)?.name ?? ''}`,
    subgroupId && `${groupLabels.subgroup}: ${groups.find((g) => g.id === subgroupId)?.name ?? ''}`,
    condition && `Condição: ${CONDITION_LABEL[condition as keyof typeof CONDITION_LABEL]}`,
    (from || to) && `Entrada: ${from ? dateBr(from) : '…'} a ${to ? dateBr(to) : '…'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const sheet = (
    <div className="stock-report__sheet">
      <header className="stock-report__sheet-head">
        <div>
          <strong>Relatório de estoque</strong>
          <span>{store?.tradeName || store?.name || ''}</span>
        </div>
        <div className="stock-report__sheet-meta">
          <span>Emitido em {new Date().toLocaleString('pt-BR')}</span>
          <span>{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
          {filtersText ? <span>{filtersText}</span> : null}
        </div>
      </header>
      <table className="stock-report__table">
        <thead>
          <tr>
            {has('photo') ? <th className="is-photo">Foto</th> : null}
            <th>Modelo</th>
            {has('attrs') ? usedAttributes.map((attr) => <th key={attr.id}>{attr.name}</th>) : null}
            {has('condition') ? <th>Condição</th> : null}
            {has('battery') ? <th>Bateria</th> : null}
            {has('imei') ? <th>IMEI</th> : null}
            {has('status') ? <th>Situação</th> : null}
            {has('origin') ? <th>Fornecedor</th> : null}
            {has('cost') ? <th className="is-num">Compra</th> : null}
            {has('price') ? <th className="is-num">Venda</th> : null}
            {has('entry') ? <th>Entrada</th> : null}
            {has('qty') ? <th className="is-num">Qtd</th> : null}
            {has('sku') ? <th>SKU</th> : null}
            {has('notes') ? <th>Observação</th> : null}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.key}>
              {has('photo') ? <td className="is-photo">{row.image ? <img src={row.image} alt="" /> : <span className="stock-report__nophoto" />}</td> : null}
              <td className="is-name">
                <strong>{row.name}</strong>
                {row.brand ? <small>{row.brand}</small> : null}
              </td>
              {has('attrs') ? usedAttributes.map((attr) => <td key={attr.id}>{row.attrs[attr.id] || '—'}</td>) : null}
              {has('condition') ? (
                <td>
                  <span className={`stock-report__cond is-${row.condition}`}>{CONDITION_LABEL[row.condition as keyof typeof CONDITION_LABEL] ?? row.condition}</span>
                </td>
              ) : null}
              {has('battery') ? <td>{row.battery !== null && row.battery !== undefined ? `${row.battery}%` : '—'}</td> : null}
              {has('imei') ? <td className="is-mono">{row.imei || '—'}</td> : null}
              {has('status') ? <td><span className={`stock-report__status ${row.sold ? 'is-sold' : row.qty > 0 ? 'is-stock' : 'is-empty'}`}>{row.sold ? 'Vendido' : row.qty > 0 ? 'Em estoque' : 'Sem estoque'}</span></td> : null}
              {has('origin') ? <td>{row.origin || '—'}</td> : null}
              {has('cost') ? <td className="is-num">{money(row.cost)}</td> : null}
              {has('price') ? <td className="is-num">{money(row.price)}</td> : null}
              {has('entry') ? <td>{dateBr(row.entryDate)}</td> : null}
              {has('qty') ? <td className="is-num">{row.qty}</td> : null}
              {has('sku') ? <td className="is-mono">{row.sku}</td> : null}
              {has('notes') ? <td className="is-notes">{row.notes || ''}</td> : null}
            </tr>
          ))}
          {!visible.length ? (
            <tr>
              <td colSpan={20} className="empty">{loading ? 'Carregando estoque…' : 'Nenhum item com esses filtros.'}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <footer className="stock-report__totals">
        <span><strong>{totals.units}</strong> {totals.units === 1 ? 'unidade' : 'unidades'}</span>
        {has('cost') ? <span>Total de compra <strong>{money(totals.cost)}</strong></span> : null}
        {has('price') ? <span>Total de venda <strong>{money(totals.price)}</strong></span> : null}
      </footer>
    </div>
  );

  return (
    <section className="admin-page stock-report">
      <article className="admin-card stock-report__filters">
        <div className="stock-report__filters-head">
          <div>
            <h2>Relatório de estoque</h2>
            <p className="empty">Escolha os filtros, as colunas e a ordem. Por aparelho, cada IMEI vira uma linha com fornecedor, custo, bateria e data de entrada.</p>
          </div>
          <button type="button" className="btn btn--primary" disabled={loading || !visible.length} onClick={print}>
            Imprimir relatório
          </button>
        </div>
        {error ? <p role="alert" className="qty-low">{error}</p> : null}
        <div className="admin-form stock-report__grid">
          <label>
            Buscar
            <input value={query} placeholder="Modelo, IMEI, cor, observação…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <AdminPicker label="Marca" value={brand} options={[{ value: '', label: 'Todas' }, ...brands.filter((b) => b.active).map((b) => ({ value: b.name, label: b.name }))]} onChange={setBrand} />
          <AdminPicker
            label={groupLabels.group}
            value={groupId}
            options={[{ value: '', label: 'Todos' }, ...groups.filter((g) => !g.parentId).map((g) => ({ value: g.id, label: g.name }))]}
            onChange={(value) => {
              setGroupId(value);
              setSubgroupId('');
            }}
          />
          <AdminPicker
            label={groupLabels.subgroup}
            value={subgroupId}
            disabled={!groupId}
            options={[{ value: '', label: 'Todos' }, ...groups.filter((g) => g.parentId === groupId).map((g) => ({ value: g.id, label: g.name }))]}
            onChange={setSubgroupId}
          />
          <AdminPicker
            label="Fornecedor / origem"
            value={origin}
            options={[{ value: '', label: 'Todos' }, { value: 'trade_in', label: 'Aparelhos de troca (clientes)' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={setOrigin}
          />
          <AdminPicker
            label="Condição"
            value={condition}
            options={[{ value: '', label: 'Todas' }, ...(['new', 'used', 'refurbished'] as const).map((code) => ({ value: code, label: CONDITION_LABEL[code] }))]}
            onChange={setCondition}
          />
          <label>
            Entrada de
            <input type="date" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Entrada até
            <input type="date" value={to} min={from || undefined} max={today()} onChange={(e) => setTo(e.target.value)} />
          </label>
          <AdminPicker label="Ordenar por" value={sort} options={SORT_OPTIONS} onChange={(value) => setSort(value as SortKey)} />
          <AdminPicker
            label="Uma linha por"
            value={mode}
            options={[
              { value: 'unit', label: 'Aparelho (cada IMEI)' },
              { value: 'variation', label: 'Variação (cor/capacidade)' },
            ]}
            onChange={(value) => setMode(value as Mode)}
          />
          <label className="stock-report__check">
            <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} />
            Só o que tem estoque
          </label>
        </div>
        <div className="stock-report__columns" role="group" aria-label="Colunas do relatório">
          <span>Colunas:</span>
          {(Object.keys(COLUMN_LABEL) as Column[]).map((column) => (
            <label key={column} className="stock-report__check">
              <input type="checkbox" checked={has(column)} onChange={() => toggleColumn(column)} />
              {COLUMN_LABEL[column]}
            </label>
          ))}
        </div>
      </article>

      <article className="admin-card stock-report__preview">{sheet}</article>

      {/* Na impressão só a folha do relatório vai para o papel. */}
      {createPortal(<div className="stock-report-print">{sheet}</div>, document.body)}
    </section>
  );
}
