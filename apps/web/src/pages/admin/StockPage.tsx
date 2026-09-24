import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  CrudListBar,
  CrudNameButton,
  CrudRowActions,
  CrudSelectionBar,
  crudFormTitle,
  matchesQuery,
  setAllVisibleIds,
  toggleIdInSet,
  type CrudStatusFilter,
} from '../../components/CrudKit';
import {
  HeadingCancelButton,
  HeadingEditButton,
  HeadingNewButton,
  HeadingSaveButton,
  PageHeadingActions,
} from '../../components/PageHeadingActions';
import {
  getAdminState,
  removeStockItem,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  upsertStockItem,
  type StockCondition,
  type StockItem,
  type StockKind,
} from '../../data/adminStore';
import { ATTRIBUTES_EVENT, stockAttributes } from '../../data/attributeStore';
import { listSuppliers } from '../../data/erpRegistry';
import {
  getFiscalClassification,
  listFiscalClassifications,
  listWarehouses,
} from '../../data/fiscalCatalog';
import { onStockChanged } from '../../data/ecommerceStore';
import { hasCapability, isTotemCatalogPath } from '../../data/moduleCapabilities';
import { fileToProductImage } from '../../data/operatorProfile';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

type Mode = 'new' | 'edit' | 'view';

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function StockPage() {
  const location = useLocation();
  const totemSurface = isTotemCatalogPath(location.pathname);
  const catalogFull = hasCapability('catalog.full');
  const lite = totemSurface || !catalogFull;
  const { confirm, dialog } = useConfirmDialog();

  const nameRef = useRef<HTMLInputElement>(null);
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const [attrDefs, setAttrDefs] = useState(() => stockAttributes());
  const [items, setItems] = useState(() => getAdminState().stock);
  const [form, setForm] = useState(() => emptyForm(attrDefs.map((item) => item.id), totemSurface));
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | StockKind>('all');
  const [attrFilterId, setAttrFilterId] = useState('all');
  const [attrFilterValue, setAttrFilterValue] = useState('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | StockCondition>('all');
  const [totemFilter, setTotemFilter] = useState<CrudStatusFilter | 'totem' | 'hidden'>(
    totemSurface ? 'totem' : 'all',
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const fiscalClasses = useMemo(() => listFiscalClassifications(true), []);
  const warehouses = useMemo(() => listWarehouses(true), []);
  const suppliers = useMemo(() => listSuppliers(true), []);
  const productPhoto = form.images[0] || '';
  const readOnly = mode === 'view';

  useEffect(() => {
    function refreshAttrs() {
      setAttrDefs(stockAttributes());
    }
    function refreshStock() {
      setItems(getAdminState().stock);
    }
    window.addEventListener(ATTRIBUTES_EVENT, refreshAttrs);
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refreshStock);
    return () => {
      window.removeEventListener(ATTRIBUTES_EVENT, refreshAttrs);
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refreshStock);
    };
  }, []);

  const visibleAttrs = useMemo(() => {
    if (!totemSurface) return attrDefs;
    return attrDefs.filter((item) => item.useOnTotem || item.filterOnTotem);
  }, [attrDefs, totemSurface]);

  const attrValueOptions = useMemo(() => {
    if (attrFilterId === 'all') return [];
    const def = attrDefs.find((item) => item.id === attrFilterId);
    return def?.values ?? [];
  }, [attrDefs, attrFilterId]);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (conditionFilter !== 'all' && item.condition !== conditionFilter) return false;
      if (totemFilter === 'totem' && !item.showOnTotem) return false;
      if (totemFilter === 'hidden' && item.showOnTotem) return false;
      if (attrFilterId !== 'all') {
        const value = item.attrs?.[attrFilterId] ?? '';
        if (!value) return false;
        if (attrFilterValue !== 'all' && value !== attrFilterValue) return false;
      }
      if (codeQuery.trim()) {
        const codeHay = `${item.sku} ${item.barcode} ${item.imei}`;
        if (!matchesQuery(codeHay, codeQuery)) return false;
      }
      return matchesQuery(
        `${item.name} ${item.sku} ${item.barcode} ${item.imei} ${item.color} ${item.capacity} ${Object.values(item.attrs ?? {}).join(' ')}`,
        query,
      );
    });
  }, [items, kindFilter, conditionFilter, totemFilter, attrFilterId, attrFilterValue, codeQuery, query]);

  function focusNameField() {
    requestAnimationFrame(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameRef.current?.focus();
      nameRef.current?.select();
    });
  }

  function resetForm() {
    setForm(emptyForm(attrDefs.map((item) => item.id), totemSurface));
    setSelectedId(null);
    setMode('new');
    setError('');
  }

  function closeForm() {
    resetForm();
    setFormVisible(false);
  }

  function startNewProduct() {
    resetForm();
    setFormVisible(true);
    focusNameField();
  }

  async function onProductPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || readOnly) return;
    try {
      const next = await fileToProductImage(file);
      setForm((current) => ({
        ...current,
        images: [next, ...current.images.slice(1)],
      }));
      setError('');
    } catch {
      setError('Não foi possível usar esta imagem. Tente outro arquivo.');
    }
  }

  function clearProductPhoto() {
    if (readOnly) return;
    setForm((current) => ({
      ...current,
      images: current.images.slice(1),
    }));
  }

  function openForm(item: StockItem, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setForm({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      imei: item.imei,
      color: item.color,
      capacity: item.capacity,
      attrs: { ...item.attrs },
      qty: item.qty,
      minQty: item.minQty,
      maxQty: item.maxQty,
      cost: item.cost,
      avgCost: item.avgCost,
      price: item.price,
      lastPurchaseAt: item.lastPurchaseAt,
      lastPurchaseCost: item.lastPurchaseCost,
      kind: item.kind,
      condition: item.condition,
      unit: item.unit ?? 'UN',
      sourceWorkOrderId: item.sourceWorkOrderId,
      showOnTotem: item.showOnTotem,
      images: [...(item.images ?? [])],
      supplierId: item.supplierId ?? '',
      fiscalClassificationId: item.fiscalClassificationId ?? '',
      warehouseId: item.warehouseId ?? '',
      trackLot: item.trackLot ?? false,
      isKit: item.isKit ?? false,
    });
    if (nextMode === 'edit' || nextMode === 'new') {
      focusNameField();
    } else {
      requestAnimationFrame(() => {
        formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  async function submit() {
    if (readOnly || !form.name.trim()) return;
    const payload = {
      ...form,
      color: form.attrs[attrDefs.find((item) => item.name.toLowerCase().includes('cor'))?.id ?? ''] ?? form.color,
      capacity:
        form.attrs[attrDefs.find((item) => item.name.toLowerCase().includes('capac'))?.id ?? ''] ??
        form.capacity,
      avgCost: form.avgCost || form.cost,
      lastPurchaseCost: form.lastPurchaseCost || form.cost,
      lastPurchaseAt: form.lastPurchaseAt || (form.cost > 0 ? new Date().toISOString() : ''),
    };
    setError('');
    const prev = mode === 'edit' && selectedId ? items.find((item) => item.id === selectedId) : null;
    try {
      const state = await upsertStockItem(
        mode === 'edit' && selectedId ? { ...payload, id: selectedId } : payload,
      );
      setItems(state.stock);
      const savedId =
        mode === 'edit' && selectedId
          ? selectedId
          : state.stock.find((row) => row.sku === payload.sku)?.id ?? state.stock[0]?.id;
      onStockChanged(savedId);
      if (prev && savedId && prev.qty !== payload.qty) {
        const delta = payload.qty - prev.qty;
        void import('../../data/stockLedger').then(({ logStockMovements }) => {
          logStockMovements([
            {
              stockId: savedId,
              stockName: payload.name,
              sku: payload.sku,
              type: 'adjust',
              qty: Math.abs(delta),
              direction: delta >= 0 ? 1 : -1,
              unitCost: payload.avgCost || payload.cost,
              balanceAfter: payload.qty,
              note: 'Ajuste via cadastro de produto',
            },
          ]);
        });
      } else if (!prev && savedId && payload.qty > 0) {
        void import('../../data/stockLedger').then(({ logStockMovements }) => {
          logStockMovements([
            {
              stockId: savedId,
              stockName: payload.name,
              sku: payload.sku,
              type: 'entry',
              qty: payload.qty,
              direction: 1,
              unitCost: payload.avgCost || payload.cost,
              balanceAfter: payload.qty,
              note: 'Saldo inicial no cadastro',
            },
          ]);
        });
      }
      resetForm();
      setFormVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar estoque.');
    }
  }

  async function askYesNo(title: string, message: string, danger = false) {
    return confirm({
      title,
      message,
      confirmLabel: 'Sim',
      cancelLabel: 'Não',
      danger,
    });
  }

  async function duplicateProduct(item: StockItem) {
    const ok = await askYesNo('Replicar registro', 'Deseja replicar esse registro?');
    if (!ok) return;
    setSelectedId(null);
    setMode('new');
    setFormVisible(true);
    setForm({
      name: `${item.name} (cópia)`,
      sku: item.sku ? `${item.sku}-COPIA` : '',
      barcode: '',
      imei: '',
      color: item.color,
      capacity: item.capacity,
      attrs: { ...item.attrs },
      qty: item.qty,
      minQty: item.minQty,
      maxQty: item.maxQty,
      cost: item.cost,
      avgCost: item.avgCost,
      price: item.price,
      lastPurchaseAt: '',
      lastPurchaseCost: item.lastPurchaseCost,
      kind: item.kind,
      condition: item.condition,
      unit: item.unit ?? 'UN',
      showOnTotem: item.showOnTotem,
      images: [...(item.images ?? [])],
      supplierId: item.supplierId ?? '',
      fiscalClassificationId: item.fiscalClassificationId ?? '',
      warehouseId: item.warehouseId ?? '',
      trackLot: item.trackLot ?? false,
      isKit: item.isKit ?? false,
    });
    focusNameField();
  }

  async function remove(item: StockItem) {
    const ok = await askYesNo(
      'Excluir registro',
      `Deseja excluir o produto "${item.name}"?`,
      true,
    );
    if (!ok) return;
    setError('');
    try {
      const state = await removeStockItem(item.id);
      setItems(state.stock);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      if (selectedId === item.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover estoque.');
    }
  }

  async function removeSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const ok = await askYesNo(
      'Excluir selecionados',
      `Deseja excluir ${ids.length} ${ids.length === 1 ? 'produto' : 'produtos'}?`,
      true,
    );
    if (!ok) return;
    setError('');
    try {
      let next = items;
      for (const id of ids) {
        const state = await removeStockItem(id);
        next = state.stock;
      }
      setItems(next);
      setSelectedIds(new Set());
      if (selectedId && ids.includes(selectedId)) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover produtos.');
    }
  }

  useEffect(() => {
    if (!formVisible || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formVisible, readOnly, mode, form, selectedId]);

  const visibleIds = visible.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const headingActions = (
    <PageHeadingActions>
      {!formVisible ? (
        <HeadingNewButton onClick={startNewProduct} label="Novo Produto" />
      ) : readOnly ? (
        <>
          <HeadingCancelButton onClick={closeForm} label="Fechar" />
          <HeadingEditButton onClick={() => setMode('edit')} />
        </>
      ) : (
        <>
          <HeadingCancelButton onClick={closeForm} />
          <HeadingSaveButton onClick={() => void submit()} />
        </>
      )}
    </PageHeadingActions>
  );

  return (
    <section className={`admin-page ${formVisible ? 'admin-page--stock-form' : ''}`}>
      {dialog}
      {headingActions}
      {!formVisible ? (
        <>
          <div className="stock-list-head">
            <div className="stock-list-head__copy">
              <h2 className="stock-list-head__title">Produtos cadastrados</h2>
              <p className="empty stock-list-head__hint">
                {visible.length} de {items.length} · filtre por nome, código, tipo ou atributo
              </p>
            </div>
          </div>

          <article className="admin-card stock-list-card">
            <CrudListBar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar produto…"
              extra={
                <>
                  <label className="admin-field crud-filter-field">
                    Código
                    <input
                      value={codeQuery}
                      onChange={(e) => setCodeQuery(e.target.value)}
                      placeholder="SKU, barras ou IMEI"
                    />
                  </label>
                  <label className="admin-field crud-filter-field">
                    Tipo
                    <AdminPicker
                      compact
                      label="Tipo"
                      value={kindFilter}
                      options={[
                        { value: 'all', label: 'Todos os tipos' },
                        { value: 'device', label: STOCK_KIND_LABEL.device },
                        { value: 'part', label: STOCK_KIND_LABEL.part },
                        { value: 'supply', label: STOCK_KIND_LABEL.supply },
                      ]}
                      onChange={(value) => setKindFilter(value as 'all' | StockKind)}
                    />
                  </label>
                  <label className="admin-field crud-filter-field">
                    Atributo
                    <AdminPicker
                      compact
                      label="Atributo"
                      value={attrFilterId}
                      options={[
                        { value: 'all', label: 'Todos atributos' },
                        ...attrDefs.map((item) => ({ value: item.id, label: item.name })),
                      ]}
                      onChange={(value) => {
                        setAttrFilterId(value);
                        setAttrFilterValue('all');
                      }}
                    />
                  </label>
                  {attrFilterId !== 'all' ? (
                    <label className="admin-field crud-filter-field">
                      Valor
                      <AdminPicker
                        compact
                        label="Valor"
                        value={attrFilterValue}
                        options={[
                          { value: 'all', label: 'Todos valores' },
                          ...attrValueOptions.map((value) => ({ value, label: value })),
                        ]}
                        onChange={setAttrFilterValue}
                      />
                    </label>
                  ) : null}
                  {!lite ? (
                    <label className="admin-field crud-filter-field">
                      Condição
                      <AdminPicker
                        compact
                        label="Condição"
                        value={conditionFilter}
                        options={[
                          { value: 'all', label: 'Todas' },
                          { value: 'new', label: STOCK_CONDITION_LABEL.new },
                          { value: 'used', label: STOCK_CONDITION_LABEL.used },
                          { value: 'refurbished', label: STOCK_CONDITION_LABEL.refurbished },
                        ]}
                        onChange={(value) => setConditionFilter(value as 'all' | StockCondition)}
                      />
                    </label>
                  ) : null}
                  <label className="admin-field crud-filter-field">
                    Totem
                    <AdminPicker
                      compact
                      label="Totem"
                      value={totemFilter}
                      options={[
                        { value: 'all', label: 'Todos' },
                        { value: 'totem', label: 'No totem' },
                        { value: 'hidden', label: 'Fora do totem' },
                      ]}
                      onChange={(value) => setTotemFilter(value as typeof totemFilter)}
                    />
                  </label>
                </>
              }
            />
            <CrudSelectionBar
              selectedCount={selectedIds.size}
              visibleCount={visible.length}
              allVisibleSelected={allVisibleSelected}
              onToggleAllVisible={() =>
                setSelectedIds(setAllVisibleIds(visibleIds, selectedIds, !allVisibleSelected))
              }
              onClear={() => setSelectedIds(new Set())}
              onDeleteSelected={() => void removeSelected()}
              entityLabel="produtos"
            />
            <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__check">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() =>
                    setSelectedIds(setAllVisibleIds(visibleIds, selectedIds, !allVisibleSelected))
                  }
                  aria-label="Marcar todos os produtos visíveis"
                />
              </th>
              <th></th>
              <th>Produto</th>
              <th>SKU / barras / IMEI</th>
              <th>Tipo</th>
              <th>Totem</th>
              <th>Variação</th>
              <th>Qtd</th>
              <th>Mín/Máx</th>
              <th>Custo méd.</th>
              <th>Preço</th>
              <th>Margem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={13} className="empty">
                  Nenhum produto encontrado. Use + Novo Produto para cadastrar.
                </td>
              </tr>
            ) : (
              visible.map((item) => {
                const avg = item.avgCost || item.cost || 0;
                const margin =
                  item.price > 0 ? (((item.price - avg) / item.price) * 100).toFixed(1) : '—';
                const checked = selectedIds.has(item.id);
                return (
                  <tr key={item.id} className={checked ? 'is-checked' : undefined}>
                    <td className="admin-table__check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedIds(toggleIdInSet(selectedIds, item.id))}
                        aria-label={`Selecionar ${item.name}`}
                      />
                    </td>
                    <td>
                      {item.images?.[0] ? (
                        <img
                          src={item.images[0]}
                          alt=""
                          width={40}
                          height={40}
                          style={{ objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <CrudNameButton onClick={() => openForm(item, 'view')}>{item.name}</CrudNameButton>
                      {item.condition === 'refurbished' ? (
                        <div className="empty">
                          Recondicionado
                          {item.sourceWorkOrderId ? (
                            <>
                              {' · '}
                              <Link to={`/os/${item.sourceWorkOrderId}`}>{item.sourceWorkOrderId}</Link>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {item.sku}
                      {item.barcode ? ` · ${item.barcode}` : ''}
                      {item.imei ? ` · IMEI ${item.imei}` : ''}
                    </td>
                    <td>
                      {STOCK_KIND_LABEL[item.kind]} · {STOCK_CONDITION_LABEL[item.condition]} ·{' '}
                      {item.unit ?? 'UN'}
                    </td>
                    <td>{item.showOnTotem ? 'Sim' : 'Não'}</td>
                    <td>
                      {attrDefs
                        .map((attr) => item.attrs?.[attr.id])
                        .filter(Boolean)
                        .join(' · ') ||
                        [item.color, item.capacity].filter(Boolean).join(' · ') ||
                        '—'}
                    </td>
                    <td className={item.qty <= item.minQty ? 'qty-low' : ''}>
                      {item.qty} {item.unit ?? 'UN'}
                    </td>
                    <td>
                      {item.minQty}/{item.maxQty || '—'}
                    </td>
                    <td>{avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="price-red">
                      {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td>{margin === '—' ? '—' : `${margin}%`}</td>
                    <td className="admin-table__actions">
                      <CrudRowActions
                        onView={() => openForm(item, 'view')}
                        onEdit={() => openForm(item, 'edit')}
                        onDuplicate={() => void duplicateProduct(item)}
                        onDelete={() => void remove(item)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </article>
        </>
      ) : null}

      {formVisible ? (
        <div className="stock-form-stack" ref={formAnchorRef}>
          <div className="stock-form-stack__head">
            <h2>{crudFormTitle(mode, 'produto')}</h2>
            {error ? <p className="qty-low">{error}</p> : null}
            <p className="empty">
              {totemSurface
                ? 'Catálogo da vitrine: nome, preço, foto, quantidade e atributos.'
                : 'Campos agrupados por tema. Tamanho (roupa/calçado) entra como atributo — cadastre em '}
              {!totemSurface ? <Link to="/erp/atributos">Atributos</Link> : null}
              {totemSurface && catalogFull ? (
                <>
                  {' '}
                  Cadastro completo em <Link to="/erp/produtos">ERP · produtos</Link>.
                </>
              ) : null}
            </p>
          </div>

          <article className="admin-card stock-form-card">
            <h3>Identificação</h3>
            <div className={`stock-id-layout ${readOnly ? 'is-readonly' : ''}`}>
              <div className="stock-photo-picker">
                <label
                  className={`stock-photo-picker__frame ${readOnly ? 'is-readonly' : ''}`}
                  title={readOnly ? 'Foto do produto' : 'Clique para alterar a foto'}
                >
                  {productPhoto ? (
                    <img src={productPhoto} alt="" />
                  ) : (
                    <span className="stock-photo-picker__empty">Foto</span>
                  )}
                  {!readOnly ? (
                    <>
                      <input type="file" accept="image/*" onChange={onProductPhoto} />
                      <em className="stock-photo-picker__hint">
                        {productPhoto ? 'Trocar foto' : 'Adicionar foto'}
                      </em>
                    </>
                  ) : null}
                </label>
                {!readOnly && productPhoto ? (
                  <button type="button" className="btn btn--ghost stock-photo-picker__clear" onClick={clearProductPhoto}>
                    Remover foto
                  </button>
                ) : null}
              </div>
              <div className={`admin-form stock-id-fields ${readOnly ? 'is-readonly' : ''}`}>
                <label className="span-2">
                  Produto
                  <input
                    ref={nameRef}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={readOnly}
                    placeholder="Nome do produto"
                  />
                </label>
                <label>
                  SKU
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    disabled={readOnly}
                  />
                </label>
                <AdminPicker
                  label="Tipo"
                  value={form.kind}
                  disabled={readOnly}
                  options={[
                    { value: 'device', label: STOCK_KIND_LABEL.device },
                    { value: 'part', label: STOCK_KIND_LABEL.part },
                    { value: 'supply', label: STOCK_KIND_LABEL.supply },
                  ]}
                  onChange={(value) => setForm({ ...form, kind: value as StockKind })}
                />
                <AdminPicker
                  label="Condição"
                  value={form.condition}
                  disabled={readOnly}
                  options={[
                    { value: 'new', label: STOCK_CONDITION_LABEL.new },
                    { value: 'used', label: STOCK_CONDITION_LABEL.used },
                    { value: 'refurbished', label: STOCK_CONDITION_LABEL.refurbished },
                  ]}
                  onChange={(value) => setForm({ ...form, condition: value as StockCondition })}
                />
                <AdminPicker
                  label="Unidade"
                  value={form.unit ?? 'UN'}
                  disabled={readOnly}
                  options={[
                    { value: 'UN', label: 'UN · inteiro' },
                    { value: 'KG', label: 'KG · pesado' },
                  ]}
                  onChange={(value) => setForm({ ...form, unit: value === 'KG' ? 'KG' : 'UN' })}
                />
                <label className="span-2 stock-id-totem">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={form.showOnTotem}
                      disabled={readOnly}
                      onChange={(e) => setForm({ ...form, showOnTotem: e.target.checked })}
                    />
                    Exibir no totem
                  </span>
                </label>
              </div>
            </div>
          </article>

          <article className="admin-card stock-form-card">
            <h3>Códigos</h3>
            <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
              <label>
                Código de barras
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  disabled={readOnly}
                />
              </label>
              {!lite ? (
                <label>
                  IMEI
                  <input
                    value={form.imei}
                    onChange={(e) => setForm({ ...form, imei: e.target.value })}
                    placeholder="Opcional"
                    disabled={readOnly}
                  />
                </label>
              ) : null}
            </div>
          </article>

          <article className="admin-card stock-form-card">
            <h3>Atributos e variações</h3>
            <p className="empty" style={{ marginTop: 0 }}>
              Cor, capacidade, tamanho (PP–XG / calçados) e demais variações vêm de{' '}
              <Link to={totemSurface ? '/painel/totem/atributos' : '/erp/atributos'}>Atributos</Link>
              .
            </p>
            <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
              {visibleAttrs.length === 0 ? (
                <p className="empty span-2">Nenhum atributo ativo para estoque.</p>
              ) : (
                visibleAttrs.map((attr) => (
                  <AdminPicker
                    key={attr.id}
                    label={attr.name}
                    value={form.attrs[attr.id] ?? ''}
                    placeholder="Selecionar"
                    disabled={readOnly}
                    options={attr.values.map((value) => ({ value, label: value }))}
                    onChange={(value) =>
                      setForm({ ...form, attrs: { ...form.attrs, [attr.id]: value } })
                    }
                  />
                ))
              )}
            </div>
          </article>

          <article className="admin-card stock-form-card">
            <h3>Estoque</h3>
            <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
              <label>
                Quantidade ({form.unit === 'KG' ? 'KG' : 'UN'})
                <input
                  type="number"
                  min={0}
                  step={form.unit === 'KG' ? 0.001 : 1}
                  value={form.qty}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                />
              </label>
              <label>
                Mínimo
                <input
                  type="number"
                  value={form.minQty}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })}
                />
              </label>
              {!lite ? (
                <label>
                  Máximo
                  <input
                    type="number"
                    value={form.maxQty}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, maxQty: Number(e.target.value) })}
                  />
                </label>
              ) : null}
            </div>
          </article>

          <article className="admin-card stock-form-card">
            <h3>Preços e custos</h3>
            <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
              {!lite ? (
                <label>
                  Custo (última compra)
                  <input
                    type="number"
                    value={form.cost}
                    disabled={readOnly}
                    onChange={(e) => {
                      const cost = Number(e.target.value);
                      setForm({
                        ...form,
                        cost,
                        avgCost: form.avgCost || cost,
                        lastPurchaseCost: cost,
                      });
                    }}
                  />
                </label>
              ) : null}
              {!lite ? (
                <label>
                  Custo médio
                  <input
                    type="number"
                    value={form.avgCost}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, avgCost: Number(e.target.value) })}
                  />
                </label>
              ) : null}
              <label>
                Preço base
                <input
                  type="number"
                  value={form.price}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
              </label>
              {!lite ? (
                <p className="empty span-2">
                  Markup{' '}
                  {form.avgCost || form.cost
                    ? `${(((form.price - (form.avgCost || form.cost)) / (form.avgCost || form.cost)) * 100).toFixed(1)}%`
                    : '—'}{' '}
                  · margem{' '}
                  {form.price
                    ? `${(((form.price - (form.avgCost || form.cost)) / form.price) * 100).toFixed(1)}%`
                    : '—'}{' '}
                  ·{' '}
                  <Link to="/erp/balanco">balanço</Link>
                  {' · '}
                  <Link to="/erp/movimentos">movimentos</Link>
                  {' · '}
                  <Link to="/erp/tabelas">tipos de preço</Link>
                </p>
              ) : null}
            </div>
          </article>

          {!lite ? (
            <article className="admin-card stock-form-card">
              <h3>Fiscal e logística</h3>
              <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
                <AdminPicker
                  label="Fornecedor"
                  value={form.supplierId ?? ''}
                  placeholder="Nenhum"
                  disabled={readOnly}
                  options={suppliers.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={(value) => setForm({ ...form, supplierId: value })}
                />
                <AdminPicker
                  label="Classificação fiscal"
                  value={form.fiscalClassificationId ?? ''}
                  placeholder="Vincular…"
                  disabled={readOnly}
                  options={fiscalClasses.map((item) => ({
                    value: item.id,
                    label: `${item.name} · NCM ${item.ncm}`,
                  }))}
                  onChange={(value) => setForm({ ...form, fiscalClassificationId: value })}
                />
                <AdminPicker
                  label="Almoxarifado padrão"
                  value={form.warehouseId ?? ''}
                  placeholder="Nenhum"
                  disabled={readOnly}
                  options={warehouses.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={(value) => setForm({ ...form, warehouseId: value })}
                />
                <AdminPicker
                  label="Controla lote (rastro)"
                  value={form.trackLot ? '1' : '0'}
                  disabled={readOnly}
                  options={[
                    { value: '1', label: 'Sim — Grupo Rastro NF-e' },
                    { value: '0', label: 'Não' },
                  ]}
                  onChange={(value) => setForm({ ...form, trackLot: value === '1' })}
                />
                <AdminPicker
                  label="É kit"
                  value={form.isKit ? '1' : '0'}
                  disabled={readOnly}
                  options={[
                    { value: '1', label: 'Sim — composição em Kits' },
                    { value: '0', label: 'Não' },
                  ]}
                  onChange={(value) => setForm({ ...form, isKit: value === '1' })}
                />
                {form.fiscalClassificationId ? (
                  <p className="empty span-2">
                    Fiscal:{' '}
                    {(() => {
                      const fis = getFiscalClassification(form.fiscalClassificationId);
                      if (!fis) return '—';
                      return `NCM ${fis.ncm} · CST ${fis.cstIcms} · ICMS ${fis.icmsRate}% · IBS ${fis.ibsRate}% · CBS ${fis.cbsRate}%`;
                    })()}{' '}
                    · <Link to="/painel/classificacao-fiscal">editar tabelas</Link>
                  </p>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function emptyForm(attrIds: string[], preferTotem = false): Omit<StockItem, 'id'> {
  return {
    name: '',
    sku: '',
    barcode: '',
    imei: '',
    color: '',
    capacity: '',
    attrs: Object.fromEntries(attrIds.map((id) => [id, ''])),
    qty: 0,
    minQty: 1,
    maxQty: 10,
    cost: 0,
    avgCost: 0,
    price: 0,
    lastPurchaseAt: '',
    lastPurchaseCost: 0,
    kind: 'device',
    condition: 'new',
    unit: 'UN',
    showOnTotem: true,
    images: [],
    supplierId: '',
    fiscalClassificationId: '',
    warehouseId: '',
    trackLot: false,
    isKit: false,
    ...(preferTotem ? { showOnTotem: true } : {}),
  };
}
