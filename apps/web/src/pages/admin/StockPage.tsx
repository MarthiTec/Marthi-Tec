import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { useBrands, findBrand, normalizeBrand } from '../../data/brandStore';
import { useDeviceReference, attributeKind } from '../../data/deviceCatalog';
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
  applyPriceTable,
  getAdminState,
  removeStockItem,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  upsertStockItem,
  type StockCondition,
  type StockItem,
  type StockKind,
} from '../../data/adminStore';
import { ATTRIBUTES_EVENT, getAttributes, stockAttributes } from '../../data/attributeStore';
import { listSuppliers } from '../../data/erpRegistry';
import {
  getFiscalClassification,
  listFiscalClassifications,
  listWarehouses,
} from '../../data/fiscalCatalog';
import { onStockChanged } from '../../data/ecommerceStore';
import { refreshAdminSlices } from '../../data/erpBootstrap';
import { hasCapability, isTotemCatalogPath } from '../../data/moduleCapabilities';
import { fileToProductImage } from '../../data/operatorProfile';
import { formatInstallment } from '../../data/variantQuote';
import { getTotemCardRate } from '../../data/cardRatesStore';
import { isNestAuthed } from '../../services/nestClient';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

type Mode = 'new' | 'edit' | 'view';

export type StockVariationRow = {
  id?: string;
  tempKey: string;
  sku: string;
  barcode: string;
  imei: string;
  attrs: Record<string, string>;
  price: number;
  cardRate?: number;
  qty: number;
  minQty: number;
  cost: number;
  condition: StockCondition;
};

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

  const [attrDefs, setAttrDefs] = useState(() => {
    const stock = stockAttributes();
    return stock.length > 0 ? stock : getAttributes().filter((a) => a.active);
  });
  const [items, setItems] = useState(() => getAdminState().stock);
  const [form, setForm] = useState(() => emptyForm(attrDefs.map((item) => item.id), totemSurface));
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | StockKind>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [attrFilterId, setAttrFilterId] = useState('all');
  const [attrFilterValue, setAttrFilterValue] = useState('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | StockCondition>('all');
  const [totemFilter, setTotemFilter] = useState<CrudStatusFilter | 'totem' | 'hidden'>(
    totemSurface ? 'totem' : 'all',
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [costMarkup, setCostMarkup] = useState('');

  // ── Estado da Grade de Variações de Produto ────────────────────────
  const [useVariations, setUseVariations] = useState(false);
  const [variations, setVariations] = useState<StockVariationRow[]>([]);
  const [originalVariationIds, setOriginalVariationIds] = useState<string[]>([]);
  const [selectedAttrIds, setSelectedAttrIds] = useState<string[]>([]);
  const { brands, error: brandsError } = useBrands();
  const { device, loading: deviceLoading, error: deviceError } = useDeviceReference(formVisible ? form.name : '');
  const brandOptions = [{ value: '', label: 'Sem marca definida' }, ...brands.filter(b => b.active || normalizeBrand(b.slug) === normalizeBrand(form.brand)).map(b => ({ value: b.slug, label: b.name })), ...(form.brand && !findBrand(brands, form.brand) ? [{ value: form.brand, label: form.brand }] : [])];
  useEffect(() => {
    if (!device || readOnly) return;
    const brand = findBrand(brands.filter(b => b.active), device.brand);
    if (brand) setForm(current => current.brand ? current : { ...current, brand: brand.slug });
  }, [device, brands, mode]);

  function referenceValues(attr: { name: string; values: string[] } | undefined) {
    const kind = attr ? attributeKind(attr.name) : null;
    return device && kind ? (kind === 'color' ? device.colors : device.capacities) : (attr?.values ?? []);
  }
  function pickReference(kind: 'color' | 'capacity', value: string) {
    const def = attrDefs.find(a => attributeKind(a.name) === kind);
    setForm(current => ({ ...current, [kind]: value, attrs: def ? { ...current.attrs, [def.id]: value } : current.attrs }));
  }

  const fiscalClasses = useMemo(() => listFiscalClassifications(true), []);
  const warehouses = useMemo(() => listWarehouses(true), []);
  const suppliers = useMemo(() => listSuppliers(true), []);
  const readOnly = mode === 'view';

  useEffect(() => {
    setCostMarkup('');
  }, [selectedId, mode, formVisible]);

  const corAttrDef = useMemo(() => {
    return (
      attrDefs.find((item) => /cor|color/i.test(item.name)) ??
      attrDefs.find((item) => item.id === 'ATTR-COR')
    );
  }, [attrDefs]);

  const capAttrDef = useMemo(() => {
    return (
      attrDefs.find((item) => /capac|armazen|mem[oó]ria|storage/i.test(item.name)) ??
      attrDefs.find((item) => item.id === 'ATTR-CAP')
    );
  }, [attrDefs]);

  useEffect(() => {
    function refreshAttrs() {
      const stock = stockAttributes();
      setAttrDefs(stock.length > 0 ? stock : getAttributes().filter((a) => a.active));
    }
    function refreshStock() {
      setItems(getAdminState().stock);
    }
    window.addEventListener(ATTRIBUTES_EVENT, refreshAttrs);
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refreshStock);

    if (isNestAuthed()) {
      void refreshAdminSlices(['stock']).catch(() => {});
    }

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
      if (brandFilter !== 'all' && normalizeBrand(item.brand) !== normalizeBrand(brandFilter)) return false;
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
        `${item.name} ${item.brand ?? ''} ${item.sku} ${item.barcode} ${item.imei} ${item.color} ${item.capacity} ${Object.values(item.attrs ?? {}).join(' ')}`,
        query,
      );
    });
  }, [items, kindFilter, brandFilter, conditionFilter, totemFilter, attrFilterId, attrFilterValue, codeQuery, query]);

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
    setUseVariations(false);
    setVariations([]);
    setOriginalVariationIds([]);
    setSelectedAttrIds(attrDefs.slice(0, 2).map((a) => a.id));
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

  // ── Gestão de Fotos (Limite Estrito de até 4 Fotos) ─────────────────
  async function onAddPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || readOnly) return;
    const availableSlots = 4 - form.images.length;
    if (availableSlots <= 0) {
      setError('Limite máximo de 4 fotos por produto atingido.');
      return;
    }
    const toProcess = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setError(`Apenas as primeiras ${availableSlots} fotos foram adicionadas (limite máximo de 4 fotos).`);
    } else {
      setError('');
    }
    try {
      const processed = await Promise.all(toProcess.map((f) => fileToProductImage(f)));
      setForm((current) => ({
        ...current,
        images: [...current.images, ...processed].slice(0, 4),
      }));
    } catch {
      setError('Não foi possível processar algumas imagens. Tente outros arquivos.');
    }
  }

  function removePhoto(indexToRemove: number) {
    if (readOnly) return;
    setForm((current) => ({
      ...current,
      images: current.images.filter((_, idx) => idx !== indexToRemove),
    }));
  }

  function makePrimaryPhoto(indexToPromote: number) {
    if (readOnly || indexToPromote === 0) return;
    setForm((current) => {
      const selected = current.images[indexToPromote];
      const rest = current.images.filter((_, idx) => idx !== indexToPromote);
      return {
        ...current,
        images: [selected, ...rest],
      };
    });
  }

  // ── Gestão da Grade de Variações ──────────────────────────────────
  function enableVariations() {
    if (useVariations) return;
    setUseVariations(true);
    if (variations.length === 0) {
      const corId = corAttrDef?.id || 'ATTR-COR';
      const capId = capAttrDef?.id || 'ATTR-CAP';
      const initialAttrs: Record<string, string> = { ...form.attrs };
      if (form.color && corId) initialAttrs[corId] = form.color;
      if (form.capacity && capId) initialAttrs[capId] = form.capacity;
      setVariations([
        {
          id: selectedId || undefined,
          tempKey: `init_${Date.now()}`,
          sku: form.sku,
          barcode: form.barcode,
          imei: form.imei,
          attrs: initialAttrs,
          price: form.price || 0,
          cardRate: form.cardRate,
          qty: form.qty || 1,
          minQty: form.minQty || 1,
          cost: form.cost || 0,
          condition: form.condition || 'new',
        },
      ]);
    }
  }

  function toggleVariationAttr(attrId: string) {
    if (readOnly) return;
    setSelectedAttrIds((curr) =>
      curr.includes(attrId) ? curr.filter((id) => id !== attrId) : [...curr, attrId],
    );
  }

  function addVariationRow() {
    if (readOnly) return;
    const lastRow = variations[variations.length - 1];
    const newAttrs: Record<string, string> = {};
    for (const attrId of selectedAttrIds) {
      newAttrs[attrId] = lastRow?.attrs[attrId] || '';
    }
    const nextSku = form.sku ? `${form.sku}-${variations.length + 1}` : '';
    const newRow: StockVariationRow = {
      tempKey: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sku: nextSku,
      barcode: '',
      imei: '',
      attrs: newAttrs,
      price: lastRow?.price || form.price || 0,
      cardRate: lastRow?.cardRate ?? form.cardRate,
      qty: 1,
      minQty: 1,
      cost: lastRow?.cost || form.cost || 0,
      condition: lastRow?.condition || form.condition || 'new',
    };
    setVariations((curr) => [...curr, newRow]);
  }

  function duplicateVariationRow(index: number) {
    if (readOnly) return;
    const target = variations[index];
    if (!target) return;
    const cloned: StockVariationRow = {
      ...target,
      id: undefined,
      tempKey: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sku: target.sku ? `${target.sku}-CP` : '',
      barcode: '',
      imei: '',
      attrs: { ...target.attrs },
    };
    setVariations((curr) => {
      const copy = [...curr];
      copy.splice(index + 1, 0, cloned);
      return copy;
    });
  }

  function removeVariationRow(index: number) {
    if (readOnly) return;
    setVariations((curr) => curr.filter((_, idx) => idx !== index));
  }

  function updateVariationRow<K extends keyof StockVariationRow>(
    index: number,
    field: K,
    value: StockVariationRow[K],
  ) {
    if (readOnly) return;
    setVariations((curr) => {
      const copy = [...curr];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function updateVariationAttr(index: number, attrId: string, attrVal: string) {
    if (readOnly) return;
    setVariations((curr) => {
      const copy = [...curr];
      const rowAttrs = { ...(copy[index]?.attrs ?? {}), [attrId]: attrVal };
      copy[index] = { ...copy[index], attrs: rowAttrs };
      return copy;
    });
  }

  function generateCombinations() {
    if (readOnly) return;
    const activeDefs = attrDefs.filter((a) => selectedAttrIds.includes(a.id) && referenceValues(a).length > 0);
    if (activeDefs.length === 0) {
      setError('Selecione ao menos um atributo com valores cadastrados para gerar combinações.');
      return;
    }
    let cartesian: Record<string, string>[] = [{}];
    for (const def of activeDefs) {
      const nextCartesian: Record<string, string>[] = [];
      for (const item of cartesian) {
        for (const val of referenceValues(def)) {
          nextCartesian.push({ ...item, [def.id]: val });
        }
      }
      cartesian = nextCartesian;
    }

    if (cartesian.length > 50) {
      setError(`Essa combinação geraria ${cartesian.length} variações. Selecione menos opções.`);
      return;
    }

    const generated: StockVariationRow[] = cartesian.map((comboAttrs, idx) => {
      const attrVals = Object.values(comboAttrs).filter(Boolean);
      const codeSuffix = attrVals.map((v) => v.slice(0, 3).toUpperCase()).join('-');
      return {
        tempKey: `gen_${Date.now()}_${idx}`,
        sku: form.sku ? `${form.sku}-${codeSuffix}` : codeSuffix,
        barcode: '',
        imei: '',
        attrs: comboAttrs,
        price: form.price || 0,
        cardRate: form.cardRate,
        qty: 1,
        minQty: 1,
        cost: form.cost || 0,
        condition: form.condition || 'new',
      };
    });

    setVariations(generated);
    setError('');
  }

  function openForm(item: StockItem, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);

    const siblings = items.filter(
      (row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    const hasMultiple = siblings.length > 1;
    setUseVariations(hasMultiple);

    const corId = corAttrDef?.id || 'ATTR-COR';
    const capId = capAttrDef?.id || 'ATTR-CAP';

    if (hasMultiple) {
      const rows: StockVariationRow[] = siblings.map((sib) => ({
        id: sib.id,
        tempKey: sib.id,
        sku: sib.sku,
        barcode: sib.barcode || '',
        imei: sib.imei || '',
        attrs: {
          ...sib.attrs,
          ...(sib.color && corId ? { [corId]: sib.color } : {}),
          ...(sib.capacity && capId ? { [capId]: sib.capacity } : {}),
        },
        price: sib.price,
        cardRate: sib.cardRate,
        qty: sib.qty,
        minQty: sib.minQty,
        cost: sib.cost,
        condition: sib.condition,
      }));
      setVariations(rows);
      setOriginalVariationIds(siblings.map((s) => s.id));
      const used = new Set<string>();
      for (const sib of siblings) {
        for (const [k, v] of Object.entries(sib.attrs ?? {})) {
          if (v) used.add(k);
        }
        if (sib.color && corId) used.add(corId);
        if (sib.capacity && capId) used.add(capId);
      }
      setSelectedAttrIds(
        used.size > 0 ? Array.from(used) : attrDefs.slice(0, 2).map((a) => a.id),
      );
    } else {
      setVariations([
        {
          id: item.id,
          tempKey: item.id || `var_${Date.now()}`,
          sku: item.sku,
          barcode: item.barcode || '',
          imei: item.imei || '',
          attrs: {
            ...item.attrs,
            ...(item.color && corId ? { [corId]: item.color } : {}),
            ...(item.capacity && capId ? { [capId]: item.capacity } : {}),
          },
          price: item.price,
          cardRate: item.cardRate,
          qty: item.qty,
          minQty: item.minQty,
          cost: item.cost,
          condition: item.condition,
        },
      ]);
      setOriginalVariationIds(item.id ? [item.id] : []);
      setSelectedAttrIds(attrDefs.slice(0, 2).map((a) => a.id));
    }


    setForm({
      name: item.name,
      brand: item.brand ?? '',
      category: item.category ?? 'Geral',
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
      cardRate: item.cardRate,
      lastPurchaseAt: item.lastPurchaseAt,
      lastPurchaseCost: item.lastPurchaseCost,
      kind: item.kind,
      condition: item.condition,
      unit: item.unit ?? 'UN',
      sourceWorkOrderId: item.sourceWorkOrderId,
      showOnTotem: item.showOnTotem,
      images: [...(item.images ?? [])].slice(0, 4),
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
    setError('');

    try {
      const corId = corAttrDef?.id || 'ATTR-COR';
      const capId = capAttrDef?.id || 'ATTR-CAP';

      if (useVariations) {
        if (variations.length === 0) {
          setError('Adicione ao menos uma variação na grade ou volte para Produto Simples.');
          return;
        }

        for (const row of variations) {
          const corVal = row.attrs[corId] || (corAttrDef ? row.attrs[corAttrDef.name] : '') || '';
          const capVal = row.attrs[capId] || (capAttrDef ? row.attrs[capAttrDef.name] : '') || '';
          const payload: Omit<StockItem, 'id'> & { id?: string } = {
            ...(row.id ? { id: row.id } : {}),
            name: form.name.trim(),
            brand: form.brand?.trim() || '',
            category: form.category?.trim() || 'Geral',
            sku:
              row.sku.trim() ||
              `${form.sku || 'SKU'}-${(corVal || 'VAR').slice(0, 3)}-${(capVal || Math.random().toString(36).slice(2, 6))}`.toUpperCase(),
            barcode: row.barcode.trim(),
            imei: row.imei.trim(),
            color: corVal,
            capacity: capVal,
            attrs: { ...row.attrs },
            qty: Number(row.qty) || 0,
            minQty: Number(row.minQty) || 0,
            maxQty: form.maxQty ?? 10,
            cost: Number(row.cost) || 0,
            avgCost: Number(row.cost) || form.avgCost || 0,
            price: Number(row.price) || 0,
            cardRate:
              row.cardRate !== undefined && !Number.isNaN(row.cardRate)
                ? Number(row.cardRate)
                : form.cardRate,
            lastPurchaseCost: Number(row.cost) || form.lastPurchaseCost || 0,
            lastPurchaseAt: form.lastPurchaseAt || new Date().toISOString(),
            kind: form.kind,
            condition: row.condition || form.condition,
            unit: form.unit,
            showOnTotem: form.showOnTotem,
            images: [...form.images].slice(0, 4),
            supplierId: form.supplierId || '',
            fiscalClassificationId: form.fiscalClassificationId || '',
            warehouseId: form.warehouseId || '',
            trackLot: Boolean(form.trackLot),
            isKit: Boolean(form.isKit),
          };
          await upsertStockItem(payload);
        }

        // Remove variações excluídas na grade
        const activeIds = new Set(variations.map((v) => v.id).filter(Boolean));
        for (const oldId of originalVariationIds) {
          if (!activeIds.has(oldId)) {
            await removeStockItem(oldId);
          }
        }

        const state = getAdminState();
        setItems(state.stock);
        onStockChanged(state.stock[0]?.id);
        resetForm();
        setFormVisible(false);
      } else {
        // Produto simples
        const payload = {
          ...form,
          name: form.name.trim(),
          brand: form.brand?.trim() || '',
          category: form.category?.trim() || 'Geral',
          images: form.images.slice(0, 4),
          color: form.attrs[corId] ?? form.color,
          capacity: form.attrs[capId] ?? form.capacity,
          avgCost: form.avgCost || form.cost,
          lastPurchaseCost: form.lastPurchaseCost || form.cost,
          lastPurchaseAt: form.lastPurchaseAt || (form.cost > 0 ? new Date().toISOString() : ''),
        };
        const prev = mode === 'edit' && selectedId ? items.find((item) => item.id === selectedId) : null;
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
        }
        resetForm();
        setFormVisible(false);
      }
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
                  <label className="admin-field crud-filter-field">
                    Marca
                    <AdminPicker
                      compact
                      label="Marca"
                      value={brandFilter}
                      options={[
                        { value: 'all', label: 'Todas marcas' },
                        ...brands.map(b => ({ value: b.slug, label: b.name })),
                      ]}
                      onChange={setBrandFilter}
                    />
                  </label>
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
            <div className="admin-table-container">
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
              <th className="col-product">Produto</th>
              <th className="col-sku">SKU / barras / IMEI</th>
              <th>Tipo</th>
              <th>Totem</th>
              <th>Variação</th>
              <th>Qtd</th>
              <th>Mín/Máx</th>
              <th>Custo méd.</th>
              <th>Preço</th>
              <th>Margem</th>
              <th className="col-actions"></th>
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
                    <td className="col-product">
                      <CrudNameButton onClick={() => openForm(item, 'view')}>{item.name}</CrudNameButton>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                        {item.brand ? (
                          <span className="stock-brand-badge">{findBrand(brands, item.brand)?.name ?? item.brand}</span>
                        ) : null}
                        {item.condition === 'refurbished' ? (
                          <span className="empty" style={{ fontSize: '0.75rem' }}>
                            Recondicionado
                            {item.sourceWorkOrderId ? (
                              <>
                                {' · '}
                                <Link to={`/os/${item.sourceWorkOrderId}`}>{item.sourceWorkOrderId}</Link>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="col-sku">
                      <div>{item.sku || '—'}</div>
                      {item.barcode ? <div className="empty">{item.barcode}</div> : null}
                      {item.imei ? <div className="empty">IMEI: {item.imei}</div> : null}
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
                      <div className="empty" style={{ fontSize: '0.78rem' }}>
                        12x de {formatInstallment(item.price, 12).split('X')[1]?.trim() ?? ''}
                      </div>
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
      </div>
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
                  Cadastro completo em <Link to="/erp/produtos">Retaguarda · produtos</Link>.
                </>
              ) : null}
            </p>
          </div>

          <article className="admin-card stock-form-card">
            <h3>Identificação</h3>
            <div className={`stock-id-layout ${readOnly ? 'is-readonly' : ''}`}>
              <div className="stock-photo-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="admin-field-label" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Fotos do produto ({form.images.length}/4)
                </span>
                <div className="stock-photos-gallery">
                  {form.images.map((imgSrc, index) => (
                    <div
                      key={index}
                      className="stock-photo-slot"
                      title={index === 0 ? 'Foto de capa (Principal)' : 'Clique para tornar foto de capa'}
                      onClick={() => !readOnly && index > 0 && makePrimaryPhoto(index)}
                      style={{ cursor: !readOnly && index > 0 ? 'pointer' : 'default' }}
                    >
                      <img src={imgSrc} alt={`Foto ${index + 1}`} />
                      {index === 0 ? (
                        <span className="stock-photo-slot__badge">Principal</span>
                      ) : !readOnly ? (
                        <span
                          className="stock-photo-slot__badge"
                          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                        >
                          Foto {index + 1}
                        </span>
                      ) : null}
                      {!readOnly ? (
                        <button
                          type="button"
                          className="stock-photo-slot__remove"
                          title="Remover foto"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePhoto(index);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {!readOnly && form.images.length < 4 ? (
                    <label
                      className="stock-photo-slot stock-photo-slot--add"
                      title="Adicionar foto (máximo 4 fotos)"
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onAddPhotos}
                      />
                      <span>+ Foto</span>
                      <small>({form.images.length}/4)</small>
                    </label>
                  ) : null}
                </div>
                <p className="empty" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                  Limite em até 4 fotos por produto (a primeira é a capa no Totem e ERP).
                </p>
              </div>

              {deviceLoading && <p role="status" className="empty">Consultando modelo…</p>}
              {deviceError && <p role="status" className="empty">{deviceError}</p>}
              {device && <div className="device-reference">
                <strong>{device.model}</strong>
                <p>Escolha a cor e a capacidade do produto. Informe o preço de venda nos campos abaixo.</p>
                <div className="admin-form">
                  <AdminPicker label="Cor do modelo" value={form.color} options={device.colors} disabled={readOnly} onChange={value => pickReference('color', value)} />
                  <AdminPicker label="Capacidade do modelo" value={form.capacity} options={device.capacities} disabled={readOnly} onChange={value => pickReference('capacity', value)} />
                </div>
                <a href={device.sourceUrl} target="_blank" rel="noreferrer">Especificações do fabricante</a>
              </div>}
              <div className={`admin-form stock-id-fields ${readOnly ? 'is-readonly' : ''}`}>
                <label className="span-2">
                  Produto
                  <input
                    ref={nameRef}
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    disabled={readOnly}
                    placeholder="Nome do produto"
                  />
                </label>
                <AdminPicker label="Marca do Produto" value={findBrand(brands, form.brand)?.slug ?? form.brand ?? ''} disabled={readOnly} options={brandOptions} onChange={brand => setForm({ ...form, brand })} />
                <p className="empty"><Link to={totemSurface ? '/painel/totem/marcas' : '/erp/marcas'}>Cadastrar ou gerenciar marcas</Link>{brandsError && <span role="alert"> · {brandsError}</span>}</p>
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

          <div className="stock-variation-tabs">
            <button
              type="button"
              className={`stock-variation-tab ${!useVariations ? 'is-active' : ''}`}
              onClick={() => !readOnly && setUseVariations(false)}
            >
              Produto Simples (Item Único)
            </button>
            <button
              type="button"
              className={`stock-variation-tab ${useVariations ? 'is-active' : ''}`}
              onClick={() => !readOnly && enableVariations()}
            >
              Grade de Variações ({variations.length} {variations.length === 1 ? 'item' : 'itens'})
            </button>
          </div>

          {useVariations ? (
            <article className="admin-card stock-form-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>Grade de Itens e Variações</h3>
                  <p className="empty" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                    Cada linha representa um item com seus atributos, preço e cálculo de parcelas em 12x para o Totem. As taxas de cartão são centralizadas em{' '}
                    <Link to="/painel/taxas-cartao" style={{ color: 'var(--accent, #2dd4bf)', textDecoration: 'underline' }}>
                      Taxas de Cartão & Maquininhas ({getTotemCardRate(12).brandName}: {getTotemCardRate(12).rate.toFixed(2).replace('.', ',')}%)
                    </Link>.
                  </p>
                </div>
                {!readOnly ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={generateCombinations}
                      title="Gera combinações dos atributos ativos"
                    >
                      Gerar combinações
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={addVariationRow}
                    >
                      + Nova Linha de Variação
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="stock-variation-toolbar">
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  Atributos na grade:
                </span>
                <div className="stock-variation-attr-pills">
                  {attrDefs.length === 0 ? (
                    <span className="empty" style={{ fontSize: '0.78rem' }}>
                      Nenhum atributo cadastrado no sistema.
                    </span>
                  ) : (
                    attrDefs.map((attr) => {
                      const selected = selectedAttrIds.includes(attr.id);
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          className={`stock-attr-pill ${selected ? 'is-selected' : ''}`}
                          onClick={() => toggleVariationAttr(attr.id)}
                          title={`Clique para ${selected ? 'remover' : 'adicionar'} ${attr.name} nas colunas da grade`}
                        >
                          {selected ? '✓ ' : '+ '}
                          {attr.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      {selectedAttrIds.map((attrId) => {
                        const def = attrDefs.find((a) => a.id === attrId);
                        return <th key={attrId}>{def?.name || attrId}</th>;
                      })}
                      <th>SKU</th>
                      <th>Preço à vista</th>
                      <th>Parcelado (12x)</th>
                      <th>Qtd</th>
                      <th>Mín</th>
                      <th>Custo</th>
                      {!readOnly ? <th className="col-actions">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {variations.length === 0 ? (
                      <tr>
                        <td colSpan={selectedAttrIds.length + 7} className="empty">
                          Nenhuma linha na grade. Clique em "+ Nova Linha de Variação" para adicionar.
                        </td>
                      </tr>
                    ) : (
                      variations.map((row, index) => {
                        const installmentText = formatInstallment(row.price, 12);

                        return (
                          <tr key={row.tempKey}>
                            {selectedAttrIds.map((attrId) => {
                              const def = attrDefs.find((a) => a.id === attrId);
                              const options = referenceValues(def).map((v) => ({
                                value: v,
                                label: v,
                              }));
                              const val = row.attrs[attrId] ?? '';

                              return (
                                <td key={attrId} style={{ minWidth: 130 }}>
                                  {options.length > 0 ? (
                                    <AdminPicker
                                      compact
                                      label={def?.name || 'Atributo'}
                                      value={val}
                                      placeholder="Selecionar"
                                      disabled={readOnly}
                                      options={options}
                                      onChange={(selectedVal) =>
                                        updateVariationAttr(index, attrId, selectedVal)
                                      }
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={val}
                                      disabled={readOnly}
                                      placeholder="Valor"
                                      style={{ minWidth: 90 }}
                                      onChange={(e) =>
                                        updateVariationAttr(index, attrId, e.target.value)
                                      }
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td>
                              <input
                                type="text"
                                value={row.sku}
                                disabled={readOnly}
                                placeholder="SKU"
                                style={{ width: 110 }}
                                onChange={(e) => updateVariationRow(index, 'sku', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.price}
                                disabled={readOnly}
                                style={{ width: 95 }}
                                onChange={(e) =>
                                  updateVariationRow(index, 'price', Number(e.target.value))
                                }
                              />
                            </td>
                            <td>
                              <span
                                className="stock-installment-badge"
                                title="Cálculo automático de 12x para totem"
                              >
                                {installmentText}
                              </span>
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={row.qty}
                                disabled={readOnly}
                                style={{ width: 65 }}
                                onChange={(e) =>
                                  updateVariationRow(index, 'qty', Number(e.target.value))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={row.minQty}
                                disabled={readOnly}
                                style={{ width: 60 }}
                                onChange={(e) =>
                                  updateVariationRow(index, 'minQty', Number(e.target.value))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.cost}
                                disabled={readOnly}
                                style={{ width: 85 }}
                                onChange={(e) =>
                                  updateVariationRow(index, 'cost', Number(e.target.value))
                                }
                              />
                            </td>
                            {!readOnly ? (
                              <td className="col-actions">
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--xs"
                                    onClick={() => duplicateVariationRow(index)}
                                    title="Duplicar esta linha com os mesmos valores"
                                  >
                                    Duplicar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--danger btn--xs"
                                    onClick={() => removeVariationRow(index)}
                                    title="Remover esta variação"
                                  >
                                    ×
                                  </button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {variations.length > 0 ? (
                <div className="stock-variation-summary">
                  <span>
                    <strong>Total de Variações:</strong> {variations.length}
                  </span>
                  <span>
                    <strong>Estoque Total:</strong>{' '}
                    {variations.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)} itens
                  </span>
                  <span>
                    <strong>Faixa de Preços:</strong> R${' '}
                    {Math.min(...variations.map((r) => Number(r.price) || 0)).toFixed(2)} até R${' '}
                    {Math.max(...variations.map((r) => Number(r.price) || 0)).toFixed(2)}
                  </span>
                </div>
              ) : null}
            </article>
          ) : (
            <>
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
                        options={referenceValues(attr).map((value) => ({ value, label: value }))}
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
                  {!lite && !readOnly ? (
                    <div className="span-2">
                      <label>
                        Acréscimo sobre o custo da última compra (%)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Informe o percentual acordado"
                          value={costMarkup}
                          onChange={(e) => setCostMarkup(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={costMarkup.trim() === '' || !Number.isFinite(Number(costMarkup))
                          || Number(costMarkup) < 0 || !Number.isFinite(form.cost) || form.cost <= 0
                          || !Number.isFinite(form.cost * (1 + Number(costMarkup) / 100) * 100)}
                        onClick={() => setForm((current) => ({
                          ...current,
                          price: applyPriceTable(current.cost, {
                            id: 'cost-preview', name: 'Cálculo interno', active: true,
                            percent: Number(costMarkup),
                          }),
                        }))}
                      >
                        Calcular preço base pelo custo
                      </button>
                      <p className="empty">
                        Cálculo interno: custo + acréscimo. Use 0% para vender pelo custo.
                        O botão preenche o preço base; confira o valor e salve o cadastro.
                      </p>
                    </div>
                  ) : null}
                  {form.price > 0 ? (
                    <p className="empty span-2" style={{ marginTop: 2, marginBottom: 4 }}>
                      <strong>Simulação Totem (12×):</strong> {formatInstallment(form.price, 12)}{' '}
                      <span style={{ fontSize: '0.82rem' }}>
                        (baseado na maquininha padrão: {getTotemCardRate(12).brandName} a{' '}
                        {getTotemCardRate(12).rate.toFixed(2).replace('.', ',')}% — configure em{' '}
                        <Link to="/painel/taxas-cartao" style={{ textDecoration: 'underline' }}>
                          Taxas de Cartão
                        </Link>
                        )
                      </span>
                    </p>
                  ) : null}
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
            </>
          )}

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
    brand: '',
    category: 'Geral',
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
    cardRate: undefined,
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
