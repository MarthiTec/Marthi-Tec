import { useEffect, useMemo, useState } from 'react';
import type { StockItem } from '../data/adminStore';
import { getAttributes, hydrateAttributesFromApi, type ProductAttribute } from '../data/attributeStore';
import { useBrands } from '../data/brandStore';
import { CONDITION_LABEL, type ProductConditionCode } from '../data/productCondition';
import { apiCreateStock, apiListSuppliers } from '../services/erpApi';
import { apiCreateStockEntry } from '../services/productCatalogApi';
import { AdminPicker } from './AdminPicker';
import { CurrencyInput } from './CurrencyInput';
import { InlineSupplierCreate } from './InlineSupplierCreate';
import { QuickModal } from './QuickModal';
import { SUPPLIER_ORIGIN_OPTIONS, type SupplierOrigin } from './SupplierEntriesModal';

const looksLikeImei = (text: string) => /^\d{8,20}$/.test(text.replace(/\s+/g, ''));

export type QuickStockResult = { product: StockItem; variationId: string | null; imei: string; price: number };

/**
 * Produto não encontrado na venda: cadastra na hora (produto novo ou nova variação de um existente)
 * com a entrada do aparelho — fornecedor, custo, IMEI e financeiro — e devolve pronto para vender.
 */
export function QuickStockRegisterModal({
  initialText,
  products,
  onClose,
  onDone,
}: {
  initialText: string;
  products: Array<{ id: string; name: string; variations?: unknown[] }>;
  onClose: () => void;
  onDone: (result: QuickStockResult) => void;
}) {
  const typedImei = looksLikeImei(initialText) ? initialText.replace(/\s+/g, '') : '';
  const [productId, setProductId] = useState('');
  const [name, setName] = useState(typedImei ? '' : initialText.toUpperCase());
  const [brand, setBrand] = useState('');
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [condition, setCondition] = useState<ProductConditionCode>('used');
  const [battery, setBattery] = useState<number | null>(null);
  const [imei, setImei] = useState(typedImei);
  const [origin, setOrigin] = useState<SupplierOrigin>('upgrade');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; origin: SupplierOrigin }>>([]);
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [payment, setPayment] = useState<'pending' | 'paid' | 'none'>('paid');
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { brands } = useBrands();

  useEffect(() => {
    apiListSuppliers(true)
      .then((rows) => setSuppliers(rows.map((row) => ({ id: row.id, name: row.tradeName || row.name, origin: row.origin === 'upgrade' ? 'upgrade' : 'company' }))))
      .catch(() => undefined);
    hydrateAttributesFromApi()
      .catch(() => undefined)
      .finally(() => setAttributes(getAttributes().filter((attr) => attr.active && attr.useOnStock)));
  }, []);

  const existing = products.find((item) => item.id === productId);
  const productOptions = useMemo(
    () => [{ value: '', label: '＋ Produto novo' }, ...products.map((item) => ({ value: item.id, label: item.name }))],
    [products],
  );

  async function save() {
    if (busy) return;
    setError('');
    const productName = name.trim().toUpperCase();
    if (!existing && !productName) return setError('Informe a descrição do produto.');
    if (!(price > 0)) return setError('Informe o preço de venda.');
    const pickedAttrs = Object.fromEntries(Object.entries(attrs).filter(([, value]) => value));
    if (existing && (existing.variations?.length ?? 0) > 0 && !Object.keys(pickedAttrs).length) return setError('Escolha a cor/capacidade da nova variação.');
    setBusy(true);
    try {
      const productIdToUse = existing
        ? existing.id
        : (await apiCreateStock({ name: productName, brand, kind: 'device', qty: 0, price, cost: 0, condition })).id;
      const useGrid = Object.keys(pickedAttrs).length > 0 || (existing?.variations?.length ?? 0) > 0;
      const imeis = imei.trim() ? [imei.trim()] : [];
      const result = await apiCreateStockEntry(productIdToUse, {
        variation: useGrid ? { attrs: pickedAttrs, condition, price } : undefined,
        entry: {
          supplierId: supplierId || null,
          qty: 1,
          unitCost: cost,
          imeis,
          batteryLevel: condition === 'new' ? 100 : battery,
          notes: 'Cadastrado na venda',
          payment,
        },
      });
      onDone({ product: result.product, variationId: result.variationId, imei: imeis[0] ?? '', price });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal
      title="Cadastrar e vender"
      subtitle="O produto não foi encontrado. Cadastre agora (com a entrada no estoque) e ele já entra na venda."
      submitLabel="Cadastrar e usar na venda"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={save}
    >
      <div className="quick-stock-register">
        <AdminPicker label="Produto" value={productId} options={productOptions} searchable onChange={setProductId} />
        {!existing ? (
          <>
            <label className="admin-field">
              Descrição
              <input value={name} maxLength={160} placeholder="Ex.: IPHONE 13 PRO MAX" onChange={(e) => setName(e.target.value.toUpperCase())} />
            </label>
            <AdminPicker
              label="Marca"
              value={brand}
              options={[{ value: '', label: 'Sem marca' }, ...brands.filter((b) => b.active).map((b) => ({ value: b.slug, label: b.name }))]}
              onChange={setBrand}
            />
          </>
        ) : null}
        {attributes.map((attr) => (
          <AdminPicker
            key={attr.id}
            label={attr.name}
            value={attrs[attr.id] ?? ''}
            options={[{ value: '', label: '—' }, ...attr.values.map((value) => ({ value, label: value }))]}
            onChange={(value) => setAttrs((current) => ({ ...current, [attr.id]: value }))}
          />
        ))}
        <AdminPicker
          label="Condição"
          value={condition}
          options={(Object.keys(CONDITION_LABEL) as ProductConditionCode[]).map((code) => ({ value: code, label: CONDITION_LABEL[code] }))}
          onChange={(value) => setCondition(value === 'new' || value === 'refurbished' ? value : 'used')}
        />
        {condition !== 'new' ? (
          <label className="admin-field">
            Bateria (%)
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={battery ?? ''}
              placeholder="Ex.: 87"
              onChange={(e) => setBattery(e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
            />
          </label>
        ) : null}
        <label className="admin-field">
          IMEI
          <input value={imei} inputMode="numeric" maxLength={20} placeholder="Opcional" onChange={(e) => setImei(e.target.value.replace(/\s+/g, ''))} />
        </label>
        <AdminPicker
          label="Origem"
          value={origin}
          options={SUPPLIER_ORIGIN_OPTIONS}
          onChange={(value) => {
            const next: SupplierOrigin = value === 'company' ? 'company' : 'upgrade';
            setOrigin(next);
            if (suppliers.find((s) => s.id === supplierId)?.origin !== next) setSupplierId('');
          }}
        />
        <div className="quick-stock-register__supplier">
          <AdminPicker
            label="Fornecedor"
            value={supplierId}
            placeholder="Nenhum"
            options={[{ value: '', label: 'Nenhum' }, ...suppliers.filter((s) => s.origin === origin).map((s) => ({ value: s.id, label: s.name }))]}
            onChange={setSupplierId}
          />
          <InlineSupplierCreate
            origin={origin}
            onCreated={(supplier) => {
              setSuppliers((current) => [...current, supplier]);
              setSupplierId(supplier.id);
            }}
          />
        </div>
        <label className="admin-field">
          Custo (compra)
          <CurrencyInput value={cost} ariaLabel="Custo de compra" onChange={setCost} />
        </label>
        <label className="admin-field">
          Preço de venda
          <CurrencyInput value={price} ariaLabel="Preço de venda" onChange={setPrice} />
        </label>
        <AdminPicker
          label="Financeiro da compra"
          value={payment}
          options={[
            { value: 'paid', label: 'Já pago (sai do caixa)' },
            { value: 'pending', label: 'A pagar (contas a pagar)' },
            { value: 'none', label: 'Não lançar no financeiro' },
          ]}
          onChange={(value) => setPayment(value === 'pending' || value === 'none' ? value : 'paid')}
        />
      </div>
    </QuickModal>
  );
}
