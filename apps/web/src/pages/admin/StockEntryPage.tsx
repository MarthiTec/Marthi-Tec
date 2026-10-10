import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { InlineSupplierCreate } from '../../components/InlineSupplierCreate';
import { SUPPLIER_ORIGIN_OPTIONS, type SupplierOrigin } from '../../components/SupplierEntriesModal';
import type { StockItem, StockVariationRow } from '../../data/adminStore';
import { getAttributes, hydrateAttributesFromApi, type ProductAttribute } from '../../data/attributeStore';
import { findBrand, useBrands } from '../../data/brandStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { CONDITION_LABEL, conditionCode, type ProductConditionCode } from '../../data/productCondition';
import { stockMatches } from '../../data/stockSearch';
import { apiListBankAccounts, apiListStock, apiListSuppliers } from '../../services/erpApi';
import { apiCreateStockEntry } from '../../services/productCatalogApi';
import '../../components/supplierEntries.css';
import './stockEntry.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const NEW_VARIATION = '__new__';

type Supplier = { id: string; name: string; origin: SupplierOrigin };

type Form = {
  variationKey: string;
  newAttrs: Record<string, string>;
  condition: ProductConditionCode;
  price: number;
  origin: SupplierOrigin;
  supplierId: string;
  entryDate: string;
  qty: number;
  unitCost: number;
  imeisText: string;
  batteryLevel: number | null;
  notes: string;
  /** Financeiro da compra: a pagar (com vencimento), já paga (sai do caixa/conta) ou sem lançamento. */
  payment: 'pending' | 'paid' | 'none';
  dueDate: string;
  accountId: string;
};

const emptyForm = (): Form => ({
  variationKey: '',
  newAttrs: {},
  condition: 'new',
  price: 0,
  origin: 'company',
  supplierId: '',
  entryDate: today(),
  qty: 1,
  unitCost: 0,
  imeisText: '',
  batteryLevel: 100,
  notes: '',
  payment: 'pending',
  dueDate: '',
  accountId: '',
});

/** Preço de venda: o do produto ou a faixa das variações. */
function salePriceText(product: StockItem) {
  const prices = (product.variations ?? []).map((v) => Number(v.price) || 0).filter((price) => price > 0);
  if (!prices.length) return money(Number(product.price) || 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} a ${money(max)}`;
}

const parseImeis = (text: string) => text.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);

function variationLabel(v: StockVariationRow) {
  const attrs = Object.entries(v.attrs ?? {})
    .filter(([, value]) => value)
    .map(([, value]) => value)
    .join(' · ');
  const condition = CONDITION_LABEL[conditionCode(v.condition) || 'new'];
  return `${attrs || 'Sem atributos'} · ${condition} · ${v.qty} un`;
}

/**
 * Entrada de estoque: escolhe o produto e lança a compra (Empresa) ou o aparelho de Upgrade com
 * fornecedor, data, quantidade, custo, IMEIs, condição e bateria. O mesmo produto recebe
 * entradas de vários fornecedores, com IMEIs, condições e baterias diferentes.
 */
export function StockEntryPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    apiListBankAccounts(true)
      .then((rows) => setAccounts(rows.map((row) => ({ id: row.id, name: row.name }))))
      .catch(() => undefined);
  }, []);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { brands } = useBrands();
  const brandName = (slug?: string) => (slug ? findBrand(brands, slug)?.name ?? slug : '');

  useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      Promise.all([apiListStock(), apiListSuppliers(true).catch(() => []), hydrateAttributesFromApi().catch(() => undefined)])
        .then(([stock, sup]) => {
          if (!alive) return;
          setItems((Array.isArray(stock) ? stock : []).filter((item) => item.active !== false));
          setSuppliers(sup.map((row) => ({ id: row.id, name: row.tradeName || row.name, origin: row.origin === 'upgrade' ? 'upgrade' : 'company' })));
          setAttributes(getAttributes().filter((attr) => attr.active && attr.useOnStock));
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

  const supplierNames = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const results = useMemo(() => (query.trim() ? items.filter((item) => stockMatches(item, query, supplierNames)).slice(0, 30) : []), [items, query, supplierNames]);
  const product = items.find((item) => item.id === selectedId) ?? null;
  const variations = product?.variations ?? [];
  const hasGrid = variations.length > 0;

  /** Atributos da grade do produto (os que as variações já usam; sem variações, os do estoque). */
  const gridAttributes = useMemo(() => {
    const used = new Set(variations.flatMap((v) => Object.keys(v.attrs ?? {})));
    return used.size ? attributes.filter((attr) => used.has(attr.id)) : attributes;
  }, [attributes, variations]);

  const imeis = parseImeis(form.imeisText);
  const creatingVariation = form.variationKey === NEW_VARIATION;
  const chosenVariation = !creatingVariation && form.variationKey ? variations.find((v) => (v.id ?? '') === form.variationKey) : undefined;
  const effectiveCondition = chosenVariation ? conditionCode(chosenVariation.condition) || 'new' : form.condition;

  function pick(item: StockItem) {
    setSelectedId(item.id);
    setQuery('');
    setNotice('');
    setError('');
    const productSupplier = suppliers.find((s) => s.id === item.supplierId);
    setForm({
      ...emptyForm(),
      variationKey: item.variations?.length ? item.variations[0].id ?? '' : '',
      price: Number(item.price) || 0,
      unitCost: Number(item.avgCost ?? item.cost) || 0,
      supplierId: productSupplier?.id ?? '',
      origin: productSupplier?.origin ?? 'company',
    });
  }

  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit() {
    if (!product) return;
    setError('');
    setNotice('');
    const qty = Number(form.qty);
    if (!(qty > 0) || !Number.isInteger(qty)) return setError('Informe a quantidade em unidades.');
    if (imeis.length > qty) return setError(`Há ${imeis.length} IMEIs para ${qty} unidade(s).`);
    const dup = imeis.find((imei, index) => imeis.indexOf(imei) !== index);
    if (dup) return setError(`O IMEI ${dup} está repetido.`);
    if (hasGrid && !form.variationKey) return setError('Escolha a variação (cor, capacidade, condição) ou crie uma nova.');
    if (creatingVariation && !Object.values(form.newAttrs).some(Boolean)) return setError('Informe ao menos um atributo da nova variação.');

    let variation: Parameters<typeof apiCreateStockEntry>[1]['variation'];
    if (creatingVariation) {
      variation = {
        attrs: Object.fromEntries(Object.entries(form.newAttrs).filter(([, value]) => value)),
        condition: form.condition,
        price: Number(form.price) || 0,
      };
    } else if (chosenVariation) {
      variation = { id: chosenVariation.id, attrs: chosenVariation.attrs ?? {}, condition: conditionCode(chosenVariation.condition) || 'new' };
    }

    setSaving(true);
    try {
      const result = await apiCreateStockEntry(product.id, {
        variation,
        entry: {
          supplierId: form.supplierId || null,
          entryDate: form.entryDate,
          qty,
          unitCost: Number(form.unitCost) || 0,
          imeis,
          notes: form.notes.trim(),
          batteryLevel: effectiveCondition === 'new' ? 100 : form.batteryLevel,
          payment: form.payment,
          dueDate: form.payment === 'pending' ? form.dueDate || form.entryDate : undefined,
          accountId: form.payment === 'paid' ? form.accountId || null : null,
        },
      });
      setItems((current) => current.map((item) => (item.id === result.product.id ? result.product : item)));
      const finance = !result.payableId ? '' : form.payment === 'paid' ? ' Compra lançada como paga no financeiro.' : ' Compra lançada no contas a pagar.';
      setNotice(`Entrada lançada: ${qty} un de ${product.name}${imeis.length ? ` (${imeis.length} IMEI${imeis.length > 1 ? 's' : ''})` : ''}.${finance}`);
      setForm((current) => ({
        ...current,
        variationKey: result.variationId ?? current.variationKey,
        newAttrs: {},
        qty: 1,
        imeisText: '',
        notes: '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível lançar a entrada.');
    } finally {
      setSaving(false);
    }
  }

  const supplierOptions = [
    { value: '', label: 'Nenhum / o do produto' },
    ...suppliers.filter((s) => s.origin === form.origin).map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <section className="admin-page stock-entry">
      <article className="admin-card">
        <h2 className="stock-entry__title">Entrada de estoque</h2>
        <p className="empty">Busque o produto pela descrição, marca, tipo, modelo, IMEI ou fornecedor e lance a entrada.</p>
        <div className="admin-form stock-entry__search">
          <label>
            Produto
            <input
              value={query}
              autoFocus
              placeholder={loading ? 'Carregando produtos…' : 'Ex.: iPhone 15 Pro Max, 3567…, Apple'}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {query.trim() ? (
          <ul className="stock-entry__results">
            {results.length ? (
              results.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => pick(item)}>
                    {item.images?.[0] ? <img src={item.images[0]} alt="" /> : <span className="stock-entry__nophoto" />}
                    <span>
                      <strong>{item.name}</strong>
                      <small>{[brandName(item.brand), item.catalogTypeName, item.catalogModelName, item.sku].filter(Boolean).join(' · ')}</small>
                    </span>
                    <em>{item.qty} un</em>
                  </button>
                </li>
              ))
            ) : (
              <li className="empty">
                Nenhum produto encontrado. <Link to="/erp/produtos">Cadastrar produto</Link>
              </li>
            )}
          </ul>
        ) : null}
      </article>

      {product ? (
        <article className="admin-card stock-entry__form">
          <header className="stock-entry__product">
            {product.images?.[0] ? <img src={product.images[0]} alt="" /> : <span className="stock-entry__nophoto" />}
            <div>
              <strong>{product.name}</strong>
              <small>
                {[brandName(product.brand), product.catalogTypeName, product.catalogModelName].filter(Boolean).join(' · ')} · estoque atual {product.qty} un · venda {salePriceText(product)}
              </small>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setSelectedId('')}>
              Trocar produto
            </button>
          </header>

          <div className="admin-form stock-entry__grid">
            {hasGrid || gridAttributes.length ? (
              <AdminPicker
                label="Variação"
                value={form.variationKey}
                placeholder="Escolha a variação"
                options={[
                  ...variations.filter((v) => v.id).map((v) => ({ value: v.id as string, label: variationLabel(v) })),
                  { value: NEW_VARIATION, label: '＋ Nova variação' },
                ]}
                onChange={(variationKey) => update({ variationKey })}
              />
            ) : null}
            {creatingVariation ? (
              <>
                {gridAttributes.map((attr) => (
                  <AdminPicker
                    key={attr.id}
                    label={attr.name}
                    value={form.newAttrs[attr.id] ?? ''}
                    placeholder="—"
                    options={[{ value: '', label: '—' }, ...attr.values.map((value) => ({ value, label: value }))]}
                    onChange={(value) => update({ newAttrs: { ...form.newAttrs, [attr.id]: value } })}
                  />
                ))}
                <AdminPicker
                  label="Condição"
                  value={form.condition}
                  options={(Object.keys(CONDITION_LABEL) as ProductConditionCode[]).map((code) => ({ value: code, label: CONDITION_LABEL[code] }))}
                  onChange={(value) => update({ condition: (conditionCode(value) || 'new') as ProductConditionCode, batteryLevel: value === 'new' ? 100 : form.batteryLevel === 100 ? null : form.batteryLevel })}
                />
                <label>
                  Preço de venda
                  <CurrencyInput value={form.price} ariaLabel="Preço de venda da nova variação" onChange={(price) => update({ price })} />
                </label>
              </>
            ) : null}

            <AdminPicker
              label="Origem"
              value={form.origin}
              options={SUPPLIER_ORIGIN_OPTIONS}
              onChange={(value) => {
                const origin: SupplierOrigin = value === 'upgrade' ? 'upgrade' : 'company';
                update({ origin, supplierId: suppliers.find((s) => s.id === form.supplierId)?.origin === origin ? form.supplierId : '' });
              }}
            />
            <div className="stock-entry__supplier">
              <AdminPicker label="Fornecedor" value={form.supplierId} placeholder="Nenhum / o do produto" options={supplierOptions} onChange={(supplierId) => update({ supplierId })} />
              <InlineSupplierCreate
                origin={form.origin}
                onCreated={(supplier) => {
                  setSuppliers((current) => [...current, supplier]);
                  update({ supplierId: supplier.id });
                }}
              />
            </div>
            <label>
              Data de entrada
              <input type="date" value={form.entryDate} max={today()} onChange={(e) => update({ entryDate: e.target.value })} />
            </label>
            <label>
              Quantidade
              <input type="number" min={1} step={1} value={form.qty} onChange={(e) => update({ qty: Number(e.target.value) })} />
            </label>
            <label>
              Custo unitário
              <CurrencyInput value={form.unitCost} ariaLabel="Custo unitário da entrada" onChange={(unitCost) => update({ unitCost })} />
            </label>
            <label>
              Bateria (%)
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                disabled={effectiveCondition === 'new'}
                value={effectiveCondition === 'new' ? 100 : form.batteryLevel ?? ''}
                placeholder="Ex.: 87"
                onChange={(e) => update({ batteryLevel: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
              />
            </label>
            <AdminPicker
              label="Financeiro"
              value={form.payment}
              options={[
                { value: 'pending', label: 'A pagar (contas a pagar)' },
                { value: 'paid', label: 'Já pago (sai do caixa)' },
                { value: 'none', label: 'Não lançar no financeiro' },
              ]}
              onChange={(value) => update({ payment: value === 'paid' || value === 'none' ? value : 'pending' })}
            />
            {form.payment === 'pending' ? (
              <label>
                Vencimento
                <input type="date" value={form.dueDate || form.entryDate} onChange={(e) => update({ dueDate: e.target.value })} />
              </label>
            ) : null}
            {form.payment === 'paid' ? (
              <AdminPicker
                label="Pago com a conta"
                value={form.accountId}
                placeholder="Só no livro caixa"
                options={[{ value: '', label: 'Só no livro caixa' }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
                onChange={(accountId) => update({ accountId })}
              />
            ) : null}
            <label className="stock-entry__wide">
              IMEIs ({imeis.length}/{Number(form.qty) || 0})
              <textarea rows={3} value={form.imeisText} placeholder="Um IMEI por linha (ou separados por espaço/vírgula)" onChange={(e) => update({ imeisText: e.target.value })} />
            </label>
            <label className="stock-entry__wide">
              Observação
              <textarea rows={2} maxLength={500} value={form.notes} placeholder="Ex.: tela trocada, bateria nova…" onChange={(e) => update({ notes: e.target.value })} />
            </label>
          </div>

          {error ? <p role="alert" className="qty-low">{error}</p> : null}
          {notice ? <p className="stock-entry__notice">{notice}</p> : null}
          <div className="stock-entry__actions">
            <span>
              Total da entrada <strong>{money((Number(form.qty) || 0) * (Number(form.unitCost) || 0))}</strong>
            </span>
            <button type="button" className="btn btn--primary" disabled={saving} onClick={submit}>
              {saving ? 'Lançando…' : 'Lançar entrada'}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
