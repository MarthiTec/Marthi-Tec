import {productSku} from '../../data/productSku';
import {ProductTotemPreview} from '../../components/ProductTotemPreview';
import {ProductDayOffers} from '../../components/ProductDayOffers';
import {ProductPriceMetrics,ProductPriceSuggestion,LastStockEntry} from '../../components/ProductPricingFields';
import {ProductPickupPrices,PickupPriceList,offeredPickupIds} from '../../components/PickupFields';
import { QuickModal } from '../../components/QuickModal';
import { usePickupMethods } from '../../data/pickup';
import { buildVariationCombinations } from '../../data/variationCombinations';
import { getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { nestRequest } from '../../services/nestClient';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickAddButton } from '../../components/QuickModal';
import { QuickCreateAttribute, QuickCreateBrand, QuickCreateSupplier } from '../../components/QuickCreate';
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
  getAdminState,
  removeStockItem,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  upsertStockItem,
  type StockCondition,
  type StockItem,
  type StockKind,
  type StockVariationRow,
} from '../../data/adminStore';
import { ATTRIBUTES_EVENT, getAttributes, stockAttributes, replaceAttributes } from '../../data/attributeStore';
import { apiListSuppliers } from '../../services/erpApi';
import { peoplePath as peopleHubPath, specificationsPath, type PeopleTab, type SpecsTab } from '../../data/hubPaths';
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

export type { StockVariationRow };

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function StockPage() {
  const location = useLocation();
  const totemSurface = isTotemCatalogPath(location.pathname);
  const specsPath = (tab: SpecsTab) => specificationsPath(location.pathname, tab);
  const peoplePath = (tab: PeopleTab) => peopleHubPath(location.pathname, tab);
  const catalogFull = hasCapability('catalog.full');
  const lite = !catalogFull && !totemSurface;
  const { confirm, dialog } = useConfirmDialog();

  const nameRef = useRef<HTMLInputElement>(null);
  const formAnchorRef = useRef<HTMLDivElement>(null);

  const [attrDefs, setAttrDefs] = useState(() => {
    const stock = stockAttributes();
    return stock.length > 0 ? stock : getAttributes().filter((a) => a.active);
  });
  const [items, setItems] = useState(() => getAdminState().stock);
  const [form, setForm] = useState(() => emptyForm(attrDefs.map((item) => item.id), totemSurface));
  const qtyDecimals = form.unit === 'KG' ? 3 : 0;
  // Preferência só de digitação (não é dado de negócio) — por isso fica no navegador, não no banco.
  const [autoUppercase, setAutoUppercase] = useState(() => {
    try { return localStorage.getItem('marthi.stock.autoUppercase') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('marthi.stock.autoUppercase', String(autoUppercase)); } catch { /* ignore */ }
  }, [autoUppercase]);
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

  // ── Estado da Grade de Variações de Produto ────────────────────────
  const [useVariations, setUseVariations] = useState(false);
  const [automationStoreId,setAutomationStoreId]=useState(getActiveStoreId);
  useEffect(()=>{const changed=()=>{setAutomationStoreId(getActiveStoreId());setFormVisible(false);setAttrDefs([]);setAutomationState({enabled:false,eligible:false});};window.addEventListener(STORE_CONTEXT_CHANGED_EVENT,changed);return()=>window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT,changed);},[]);
  const [automationState, setAutomationState] = useState({enabled:false,eligible:false});
  const [automationBusy, setAutomationBusy] = useState(false);
  useEffect(() => {
    if (!isNestAuthed()) return;
    let disposed=false;
    void nestRequest<{enabled:boolean;eligible:boolean;attributes:ReturnType<typeof getAttributes>}>('/attributes/automation').then(data=>{
      if(disposed)return;
      replaceAttributes(data.attributes);
      setAttrDefs(data.attributes.filter(a=>a.active&&a.useOnStock));
      setAutomationState(data);
    }).catch(e=>{if(!disposed)setError(e.message);});
    return ()=>{disposed=true;};
  }, [automationStoreId]);
  async function toggleAutomation(enabled:boolean) {
    setAutomationBusy(true);
    try {
      const data=await nestRequest<{enabled:boolean;eligible:boolean;attributes:ReturnType<typeof getAttributes>}>('/attributes/automation',{method:'PUT',body:JSON.stringify({enabled})});
      replaceAttributes(data.attributes);
      setAttrDefs(data.attributes.filter(a=>a.active&&a.useOnStock));
      setAutomationState(data);
      if(enabled&&mode==='new') {generatedModel.current='';setSelectedAttrIds(data.attributes.filter(a=>a.active&&a.useOnStock).map(a=>a.id));enableVariations();}
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a automação.');}
    finally{setAutomationBusy(false);}
  }

  const [photoUrl, setPhotoUrl] = useState('');
  const [totemPhotoPreview,setTotemPhotoPreview]=useState(false);
  const [variations, setVariations] = useState<StockVariationRow[]>([]);
  const [originalVariationIds, setOriginalVariationIds] = useState<string[]>([]);
  const [selectedAttrIds, setSelectedAttrIds] = useState<string[]>([]);
  const {methods:pickupMethods}=usePickupMethods();
  // Preço por retirada de uma linha da grade de variações (janela rápida).
  const [pickupEdit, setPickupEdit] = useState<{ index: number; prices: Record<string, number | null>; base: number } | null>(null);
  const saveInProgress = useRef(false);
  const [saving, setSaving] = useState(false);
  const generatedModel=useRef('');
  const { brands, error: brandsError } = useBrands();
  const { device, loading: deviceLoading, error: deviceError } = useDeviceReference(formVisible && automationState.enabled ? form.name : '',form.brand??'');
  const brandOptions = [{ value: '', label: 'Sem marca definida' }, ...brands.filter(b => b.active || normalizeBrand(b.slug) === normalizeBrand(form.brand)).map(b => ({ value: b.slug, label: b.name })), ...(form.brand && !findBrand(brands, form.brand) ? [{ value: form.brand, label: form.brand }] : [])];
  useEffect(() => {
    if (!device || readOnly) return;
    const brand = findBrand(brands.filter(b => b.active), device.brand);
    if (brand) setForm(current => current.brand ? current : { ...current, brand: brand.slug });
  }, [device, brands, mode]);

  useEffect(() => {
    if (!formVisible || mode !== 'new' || !automationState.enabled || !automationState.eligible || !device) return;
    const defs=attrDefs.filter(a=>a.active && a.useOnStock && attributeKind(a.name));
    if(!defs.some(a=>attributeKind(a.name)==='color') || !defs.some(a=>attributeKind(a.name)==='capacity'))return;
    const signature=JSON.stringify([automationStoreId,device.model,defs.map(a=>[a.id,referenceValues(a)])]);
    if(generatedModel.current===signature)return;
    try {
      const combos=buildVariationCombinations(defs.map(a=>({id:a.id,values:referenceValues(a)})));
      setSelectedAttrIds(defs.map(a=>a.id));
      setUseVariations(true);
      setVariations(combos.map((attrs,index)=>({tempKey:`help_${Date.now()}_${index}`,barcode:'',imei:'',attrs,price:form.price||0,cardRate:form.cardRate,qty:0,minQty:0,cost:form.cost||0,condition:form.condition||'new'})));
      generatedModel.current=signature;
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível gerar as variações.');}
  },[device,attrDefs,automationState.enabled,automationState.eligible,formVisible,mode,automationStoreId]);

  function referenceValues(attr: { name: string; values: string[] } | undefined) {
    const kind = attr ? attributeKind(attr.name) : null;
    return device && kind ? (kind === 'color' ? device.colors : device.capacities) : (attr?.values ?? []);
  }

  const fiscalClasses = useMemo(() => listFiscalClassifications(true), []);
  const warehouses = useMemo(() => listWarehouses(true), []);
  // Cadastro rápido sem sair do produto: fornecedor, marca e atributo.
  const [quickCreate, setQuickCreate] = useState<null | 'supplier' | 'brand' | 'attribute'>(null);
  const [supplierVersion, setSupplierVersion] = useState(0);
  // Fornecedores vêm direto do banco (nada de cópia local).
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void apiListSuppliers(true).then((rows) => { if (alive) setSuppliers(rows.map((row) => ({ id: row.id, name: row.tradeName || row.name }))); }).catch(() => undefined);
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => { alive = false; window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load); };
  }, [supplierVersion]);
  const readOnly = mode === 'view';


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
    generatedModel.current='';
    setForm(emptyForm(attrDefs.map((item) => item.id), totemSurface));
    setSelectedId(null);
    setMode('new');
    setError('');
    setUseVariations(automationState.eligible && automationState.enabled);
    setVariations(automationState.eligible && automationState.enabled ? [{tempKey:`auto_${Date.now()}`,barcode:'',imei:'',attrs:{},price:0,cardRate:0,qty:1,minQty:1,cost:0,condition:'new'}] : []);
    setOriginalVariationIds([]);
    setSelectedAttrIds((automationState.enabled ? attrDefs : attrDefs.slice(0, 2)).map((a) => a.id));
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

  // ── Gestão de fotos do produto ─────────────────
  async function onAddPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || readOnly) return;
    setError('');
    try {
      const processed: string[] = [];
      for (const file of files) processed.push(await fileToProductImage(file));
      if (JSON.stringify([...form.images,...processed]).length > 4_000_000) {
        throw new Error('As fotos excedem o tamanho permitido por envio. Utilize URLs de fotos hospedadas para um catálogo maior.');
      }
      setForm((current) => ({
        ...current,
        images: [...current.images, ...processed],
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível processar algumas imagens.');
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
          pricingPolicy: form.pricingPolicy,
          lastEntry: form.lastEntry,
          avgCost: form.avgCost,
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
    const newRow: StockVariationRow = {
      tempKey: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pricingPolicy: lastRow?.pricingPolicy ?? form.pricingPolicy,
      lastEntry: null,
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
      lastEntry: null,
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
      return {
        tempKey: `gen_${Date.now()}_${idx}`,
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

    const corId = corAttrDef?.id || 'ATTR-COR';
    const capId = capAttrDef?.id || 'ATTR-CAP';

    if (item.variations && item.variations.length > 0) {
      setUseVariations(true);
      const rows: StockVariationRow[] = item.variations.map((v, idx) => ({
        id: v.id,
        tempKey: v.tempKey || v.id || `var_${Date.now()}_${idx}`,
        pricingPolicy: v.pricingPolicy,
        lastEntry: v.lastEntry,
        avgCost: v.avgCost,
        barcode: v.barcode || '',
        imei: v.imei || '',
        attrs: { ...v.attrs },
        price: v.price,
        pickupPrices: v.pickupPrices,
        cardRate: v.cardRate,
        qty: v.qty,
        minQty: v.minQty,
        cost: v.cost,
        condition: v.condition,
      }));
      setVariations(rows);
      setOriginalVariationIds(item.id ? [item.id] : []);
      const used = new Set<string>();
      for (const row of rows) {
        for (const [k, v] of Object.entries(row.attrs ?? {})) {
          if (v) used.add(k);
        }
      }
      setSelectedAttrIds(
        used.size > 0 ? Array.from(used) : attrDefs.slice(0, 2).map((a) => a.id),
      );
    } else {
      const siblings = items.filter(
        (row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      );
      const hasMultiple = siblings.length > 1;
      setUseVariations(hasMultiple);

      if (hasMultiple) {
        const rows: StockVariationRow[] = siblings.map((sib) => ({
          id: sib.id,
          tempKey: sib.id,
          pricingPolicy: sib.pricingPolicy,
          lastEntry: sib.lastEntry,
          avgCost: sib.avgCost,
          barcode: sib.barcode || '',
          imei: sib.imei || '',
          attrs: {
            ...sib.attrs,
            ...(sib.color && corId ? { [corId]: sib.color } : {}),
            ...(sib.capacity && capId ? { [capId]: sib.capacity } : {}),
          },
          price: sib.price,
          pickupPrices: sib.pickupPrices,
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
            pricingPolicy: item.pricingPolicy,
            lastEntry: item.lastEntry,
            avgCost: item.avgCost,
            barcode: item.barcode || '',
            imei: item.imei || '',
            attrs: {
              ...item.attrs,
              ...(item.color && corId ? { [corId]: item.color } : {}),
              ...(item.capacity && capId ? { [capId]: item.capacity } : {}),
            },
            pickupPrices: item.pickupPrices ?? {},
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
    }

    setForm({
      name: item.name,
      brand: item.brand ?? '',
      category: item.category ?? 'Geral',
      sku: item.sku,
      skuAuto: false,
      pricingPolicy: item.pricingPolicy,
      lastEntry: item.lastEntry,
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
      pickupPrices: item.pickupPrices ?? {},
      price: item.price,
      cardRate: item.cardRate,
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

  function skuPreview(attrs: Record<string, string> = form.attrs, condition = form.condition) {
    return form.name.trim()
      ? productSku({
          ...form,
          brand: findBrand(brands, form.brand ?? '')?.name ?? form.brand,
          attrs,
          color: attrs[attrDefs.find((a) => a.name.toLowerCase() === 'cor')?.id ?? ''] ?? '',
          capacity: attrs[attrDefs.find((a) => a.name.toLowerCase() === 'capacidade')?.id ?? ''] ?? '',
          condition,
        })
      : '';
  }

  async function submit() {
    if (readOnly || !form.name.trim() || saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setError('');

    try {
      const corId = corAttrDef?.id || 'ATTR-COR';
      const capId = capAttrDef?.id || 'ATTR-CAP';

      if (useVariations && variations.length === 0) {
        setError('Adicione ao menos uma variação na grade ou volte para Produto Simples.');
        saveInProgress.current = false;
        setSaving(false);
        return;
      }

      const masterQty = useVariations
        ? variations.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
        : Number(form.qty) || 0;
      const masterMinQty = useVariations
        ? variations.reduce((sum, r) => sum + (Number(r.minQty) || 0), 0)
        : Number(form.minQty) || 0;
      const masterCost = useVariations
        ? Number(variations[0]?.cost) || Number(form.cost) || 0
        : Number(form.cost) || 0;
      const masterPrice = useVariations
        ? Number(variations[0]?.price) || Number(form.price) || 0
        : Number(form.price) || 0;
      const masterSku = form.skuAuto ? skuPreview(form.attrs) : form.sku.trim();

      const cleanedVariations: StockVariationRow[] = useVariations
        ? variations.map((row) => ({
            id: row.id,
            attrs: { ...row.attrs },
            price: Number(row.price) || 0,
            cost: Number(row.cost) || 0,
            avgCost: row.avgCost ?? (Number(row.cost) || 0),
            qty: Number(row.qty) || 0,
            minQty: Number(row.minQty) || 0,
            cardRate:
              row.cardRate !== undefined && !Number.isNaN(row.cardRate)
                ? Number(row.cardRate)
                : form.cardRate,
            condition: row.condition || form.condition,
            barcode: (row.barcode || '').trim(),
            imei: (row.imei || '').trim(),
            pickupPrices: row.pickupPrices ?? {},
            pickupMethodId: row.pickupMethodId || undefined,
            pricingPolicy: row.pricingPolicy ?? null,
          }))
        : [];

      const payload = {
        ...form,
        name: form.name.trim(),
        brand: form.brand?.trim() || '',
        category: form.category?.trim() || 'Geral',
        sku: masterSku,
        skuAuto: form.skuAuto !== false,
        barcode: form.barcode.trim(),
        imei: form.imei.trim(),
        color: form.attrs[corId] ?? form.color,
        capacity: form.attrs[capId] ?? form.capacity,
        attrs: { ...form.attrs },
        qty: masterQty,
        minQty: masterMinQty,
        maxQty: form.maxQty ?? 10,
        cost: masterCost,
        avgCost: form.avgCost || masterCost,
        price: masterPrice,
        cardRate: form.cardRate,
        lastPurchaseCost: form.lastPurchaseCost || masterCost,
        lastPurchaseAt: form.lastEntry?.enteredAt ?? '',
        kind: form.kind,
        condition: form.condition,
        unit: form.unit,
        showOnTotem: form.showOnTotem,
        images: [...form.images],
        supplierId: form.supplierId || '',
        fiscalClassificationId: form.fiscalClassificationId || '',
        warehouseId: form.warehouseId || '',
        trackLot: Boolean(form.trackLot),
        isKit: Boolean(form.isKit),
        variations: cleanedVariations,
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

      // Se havia registros duplicados legados (irmãos salvos como produtos avulsos no passado), limpa-os
      if (useVariations && originalVariationIds.length > 0) {
        for (const oldId of originalVariationIds) {
          if (oldId && oldId !== savedId && oldId !== selectedId) {
            await removeStockItem(oldId);
          }
        }
      }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar estoque.');
    } finally {
      saveInProgress.current = false;
      setSaving(false);
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
    const copiedVariations = (item.variations ?? []).map((variation, index) => ({
      ...variation,
      // A cópia precisa nascer como um produto novo: não pode reutilizar a
      // identidade da variação, nem códigos que devem ser exclusivos.
      id: undefined,
      tempKey: `copy_${Date.now()}_${index}`,
      barcode: '',
      imei: '',
      attrs: { ...variation.attrs },
      pickupPrices: { ...(variation.pickupPrices ?? {}) },
    }));
    setUseVariations(copiedVariations.length > 0);
    setVariations(copiedVariations);
    setOriginalVariationIds([]);
    const copiedAttributeIds = new Set<string>();
    for (const variation of copiedVariations) {
      for (const [attributeId, value] of Object.entries(variation.attrs)) {
        if (value) copiedAttributeIds.add(attributeId);
      }
    }
    setSelectedAttrIds(
      copiedAttributeIds.size > 0
        ? Array.from(copiedAttributeIds)
        : attrDefs.slice(0, 2).map((attribute) => attribute.id),
    );
    setForm({
      name: `${item.name} (cópia)`,
      sku: '',skuAuto:true,pricingPolicy:item.pricingPolicy,lastEntry:null,
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
      pickupPrices: item.pickupPrices ?? {},
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
          <HeadingSaveButton onClick={() => void submit()} disabled={saving} label={saving ? 'Salvando…' : 'Salvar'} />
        </>
      )}
    </PageHeadingActions>
  );

  return (
    <section className={`admin-page ${formVisible ? 'admin-page--stock-form' : ''}`}>
      {dialog}
      {totemPhotoPreview && <ProductTotemPreview name={form.name} images={form.images} price={variations.find(v=>v.price>0)?.price??form.price} attributes={variations.find(v=>v.price>0)?.attrs??form.attrs} onClose={()=>setTotemPhotoPreview(false)}/>}
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
                      {item.variations && item.variations.length > 0 ? (
                        <div>
                          <span
                            className="stock-brand-badge"
                            style={{
                              background: 'rgba(45, 212, 191, 0.15)',
                              color: 'var(--accent, #2dd4bf)',
                              fontWeight: 600,
                            }}
                          >
                            {item.variations.length} {item.variations.length === 1 ? 'variação' : 'variações'}
                          </span>
                          <div className="empty" style={{ fontSize: '0.75rem', marginTop: 3 }}>
                            {(() => {
                              const attrSets: Record<string, Set<string>> = {};
                              for (const v of item.variations) {
                                for (const [k, val] of Object.entries(v.attrs || {})) {
                                  if (val) {
                                    if (!attrSets[k]) attrSets[k] = new Set();
                                    attrSets[k].add(val);
                                  }
                                }
                              }
                              return Object.values(attrSets)
                                .map((set) => Array.from(set).join(', '))
                                .join(' · ');
                            })()}
                          </div>
                        </div>
                      ) : (
                        attrDefs
                          .map((attr) => item.attrs?.[attr.id])
                          .filter(Boolean)
                          .join(' · ') ||
                        [item.color, item.capacity].filter(Boolean).join(' · ') ||
                        '—'
                      )}
                    </td>
                    <td className={item.qty <= item.minQty ? 'qty-low' : ''}>
                      {item.qty} {item.unit ?? 'UN'}
                      {item.variations && item.variations.length > 0 ? (
                        <div className="empty" style={{ fontSize: '0.72rem' }}>
                          (grade total)
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {item.minQty}/{item.maxQty || '—'}
                    </td>
                    <td>{avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="price-red">
                      {(() => {
                        if (item.variations && item.variations.length > 0) {
                          const prices = item.variations
                            .map((v) => Number(v.price) || 0)
                            .filter((p) => p > 0);
                          const minP = prices.length ? Math.min(...prices) : item.price;
                          const maxP = prices.length ? Math.max(...prices) : item.price;
                          if (minP !== maxP && minP > 0) {
                            return (
                              <>
                                <div>
                                  {minP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ~{' '}
                                  {maxP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                                <div className="empty" style={{ fontSize: '0.78rem' }}>
                                  18x a partir de {formatInstallment(minP, 18).split('X')[1]?.trim() ?? ''}
                                </div>
                              </>
                            );
                          }
                        }
                        return (
                          <>
                            {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            <div className="empty" style={{ fontSize: '0.78rem' }}>
                              18x de {formatInstallment(item.price, 18).split('X')[1]?.trim() ?? ''}
                            </div>
                          </>
                        );
                      })()}
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
              {!totemSurface ? <Link to={specsPath('atributos')}>Especificações</Link> : null}
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
              <div className="stock-photo-picker">
                <span className="stock-photo-picker__title">
                  Fotos do produto ({form.images.length})
                </span>
                <button type="button" className="btn btn--ghost btn--sm stock-photo-picker__preview" onClick={()=>setTotemPhotoPreview(true)}>Prévia no totem</button>
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

                  {!readOnly ? (
                    <label
                      className="stock-photo-slot stock-photo-slot--add"
                      title="Adicionar fotos"
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onAddPhotos}
                      />
                      <span>+ Foto</span>
                      <small>({form.images.length})</small>
                    </label>
                  ) : null}
                </div>
                {!readOnly && <div className="stock-photo-url">
                  <label className="admin-field">Foto hospedada (HTTPS)
                    <input type="url" value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} placeholder="https://…" />
                  </label>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={()=>{
                    try {const url=new URL(photoUrl.trim());if(url.protocol!=='https:')throw new Error();setForm(current=>({...current,images:[...current.images,url.href]}));setPhotoUrl('');setError('');}
                    catch {setError('Informe uma URL HTTPS válida para a foto.');}
                  }}>Adicionar URL</button>
                </div>}
                <p className="empty stock-photo-picker__help">
                  A primeira foto é a capa no Totem e ERP. Prefira fundo branco ou transparente.
                </p>
              </div>

              <div className="stock-id-content">
          {automationState.eligible && <label className="stock-automation-toggle">
            <input type="checkbox" checked={automationState.enabled} disabled={readOnly || automationBusy} onChange={e=>void toggleAutomation(e.target.checked)} />
            Receber ajuda para criar todas as variações do produto
          </label>}
              {deviceLoading && <p role="status" className="empty">Consultando modelo…</p>}
              {deviceError && <p role="status" className="empty">{deviceError}</p>}
              {device && <div className="device-reference">
                <strong>{device.model}</strong>
                <p>As combinações de cor e capacidade estão na grade abaixo. Exclua as que não vende e informe preço e estoque antes de salvar.</p>
                <a href={device.sourceUrl} target="_blank" rel="noreferrer">Fonte das especificações</a>{device.stale&&<p className="empty">Dados salvos anteriormente; a API está indisponível para atualizar.</p>}
              </div>}
              <div className={`admin-form stock-id-fields ${readOnly ? 'is-readonly' : ''}`}>
                <label className="span-2">
                  Produto
                  <input
                    ref={nameRef}
                    value={form.name}
                    onChange={e => setForm({ ...form, name: autoUppercase ? e.target.value.toUpperCase() : e.target.value })}
                    disabled={readOnly}
                    placeholder="Nome do produto"
                  />
                  <label className="stock-uppercase-toggle" title="Converte o que você digitar no nome do produto para maiúsculas automaticamente">
                    <input
                      type="checkbox"
                      checked={autoUppercase}
                      onChange={e => setAutoUppercase(e.target.checked)}
                      disabled={readOnly}
                    />
                    Sempre em MAIÚSCULAS
                  </label>
                </label>
                <div className="stock-brand-field">
                <AdminPicker label="Marca do Produto" value={findBrand(brands, form.brand)?.slug ?? form.brand ?? ''} disabled={readOnly} options={brandOptions} onChange={brand => setForm({ ...form, brand })} />
                <p className="empty quick-field__actions">{!readOnly ? <QuickAddButton label="Nova marca" onClick={() => setQuickCreate('brand')} /> : null}<Link to={specsPath('marcas')}>Gerenciar marcas</Link>{brandsError && <span role="alert"> · {brandsError}</span>}</p>
                </div>
                <div className="stock-brand-field">
                <AdminPicker
                  label="Fornecedor"
                  value={form.supplierId ?? ''}
                  placeholder="Nenhum"
                  disabled={readOnly}
                  options={[{ value: '', label: 'Nenhum' }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]}
                  onChange={(value) => setForm({ ...form, supplierId: value })}
                />
                <p className="empty quick-field__actions">{!readOnly ? <QuickAddButton label="Novo fornecedor" onClick={() => setQuickCreate('supplier')} /> : null}<Link to={peoplePath('fornecedores')}>Gerenciar fornecedores</Link></p>
                </div>
                {quickCreate === 'brand' ? <QuickCreateBrand onClose={() => setQuickCreate(null)} onCreated={(brand) => setForm((current) => ({ ...current, brand: brand.slug }))} /> : null}
                {quickCreate === 'supplier' ? <QuickCreateSupplier onClose={() => setQuickCreate(null)} onCreated={(supplierId) => { setSupplierVersion((v) => v + 1); setForm((current) => ({ ...current, supplierId })); }} /> : null}
                {quickCreate === 'attribute' ? <QuickCreateAttribute onClose={() => setQuickCreate(null)} onCreated={() => undefined} /> : null}
                {pickupEdit ? (
                  <QuickModal
                    title="Preço por tipo de retirada"
                    subtitle="Marque onde esta variação é vendida e o preço de cada forma (ex.: encomenda mais em conta)."
                    submitLabel="Aplicar"
                    onClose={() => setPickupEdit(null)}
                    onSubmit={() => {
                      const edit = pickupEdit;
                      setVariations((current) => current.map((r, i) => (i === edit.index ? { ...r, pickupMethodId: '', pickupPrices: edit.prices } : r)));
                      setPickupEdit(null);
                    }}
                  >
                    <PickupPriceList methods={pickupMethods} value={pickupEdit.prices} basePrice={pickupEdit.base} onChange={(prices) => setPickupEdit((current) => (current ? { ...current, prices } : current))} />
                  </QuickModal>
                ) : null}
                <label>
                  SKU
                  <input
                    value={form.skuAuto?skuPreview(form.attrs):form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value,skuAuto:false })}
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


          <p><Link to="/erp/api-aparelhos">Configurar consulta de aparelhos por API</Link></p>
          <label className="stock-sku-automation"><input type="checkbox" checked={Boolean(form.skuAuto)} disabled={readOnly} onChange={e=>setForm(current=>({...current,skuAuto:e.target.checked}))}/> Gerar SKU automaticamente com os dados do produto</label>
          {!useVariations&&<ProductPickupPrices value={form.pickupPrices} basePrice={form.price} disabled={readOnly} onChange={pickupPrices=>setForm(current=>({...current,pickupPrices}))}/>}
          <p><Link to={specsPath('retirada')}>Cadastrar tipos de retirada e acompanhar entregas</Link></p>
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
                    Cada linha representa um item com seus atributos, preço e cálculo de parcelas em 18x para o Totem. As taxas de cartão são centralizadas em{' '}
                    <Link to="/painel/taxas-cartao" style={{ color: 'var(--accent, #2dd4bf)', textDecoration: 'underline' }}>
                      Taxas de Cartão & Maquininhas ({getTotemCardRate(18).brandName}: {getTotemCardRate(18).rate.toFixed(2).replace('.', ',')}%)
                    </Link>.
                  </p>
                </div>
                {!readOnly ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <QuickAddButton label="Novo atributo" onClick={() => setQuickCreate('attribute')} />
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

              <div className="stock-variation-container">
                <table className="admin-table stock-variation-grid">
                  <thead>
                    <tr>
                      {selectedAttrIds.map((attrId) => {
                        const def = attrDefs.find((a) => a.id === attrId);
                        return <th key={attrId}>{def?.name || attrId}</th>;
                      })}
                      <th>Tipo de retirada</th>
                      <th>Custo unitário</th>
                      <th>Preço à vista</th>
                      <th>Parcelado (18x)</th>
                      <th>Qtd</th>
                      <th>Mín</th>
                      <th>Margem / markup</th>
                      <th>Sugestão de venda</th>
                      <th>Última entrada / nota</th>
                      {!readOnly ? <th className="col-actions">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {variations.length === 0 ? (
                      <tr>
                        <td colSpan={selectedAttrIds.length + 9 + (readOnly ? 0 : 1)} className="empty">
                          Nenhuma linha na grade. Clique em "+ Nova Linha de Variação" para adicionar.
                        </td>
                      </tr>
                    ) : (
                      variations.map((row, index) => {
                        const rowPrice=row.pickupMethodId ? row.pickupPrices?.[row.pickupMethodId]??row.price : row.price;
                        const installmentText = formatInstallment(rowPrice, 18, (row.cardRate??form.cardRate) || undefined);

                        return (
                          <tr key={row.tempKey} className="stock-variation-row" style={{ gridTemplateColumns: `repeat(${Math.ceil((selectedAttrIds.length + 9) / 2)}, minmax(0, 1fr))${readOnly ? "" : " minmax(64px, 0.65fr)"}` }}>
                            {selectedAttrIds.map((attrId, attrIdx) => {
                              const def = attrDefs.find((a) => a.id === attrId);
                              const options = referenceValues(def).map((v) => ({
                                value: v,
                                label: v,
                              }));
                              const val = row.attrs[attrId] ?? '';

                              return (
                                <td
                                  key={attrId}
                                  className="stock-variation-attr-cell"
                                  data-label={attrIdx === 0 ? `Item #${index + 1} · ${def?.name || 'Atributo'}` : (def?.name || 'Atributo')}
                                >
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
                                      aria-label={def?.name || 'Atributo'}
                                      value={val}
                                      disabled={readOnly}
                                      placeholder="Valor"
                                      onChange={(e) =>
                                        updateVariationAttr(index, attrId, e.target.value)
                                      }
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td data-label="Tipo de retirada">{(()=>{const prices=row.pickupMethodId?{[row.pickupMethodId]:rowPrice}:row.pickupPrices??{};const names=offeredPickupIds(pickupMethods,prices).map(id=>pickupMethods.find(m=>m.id===id)?.name).filter(Boolean);return <button type="button" className="pickup-price-summary" disabled={readOnly} title="Definir onde esta variação é vendida e o preço de cada forma" onClick={()=>setPickupEdit({index,prices,base:Number(rowPrice)||0})}>{names.length?names.join(' · '):'Nenhuma'} <span aria-hidden>✎</span></button>;})()}</td>
                            <td data-label="Custo unitário"><CurrencyInput ariaLabel="Custo unitário da variação" value={row.cost} disabled={readOnly} onChange={value=>updateVariationRow(index,'cost',value)}/></td>
                            <td data-label="Preço à vista">
                              <CurrencyInput
                                ariaLabel="Preço de venda da variação"
                                value={rowPrice}
                                disabled={readOnly}
                                onChange={(value) =>
                                  row.pickupMethodId ? setVariations(current=>current.map((r,i)=>i===index?{...r,pickupPrices:{...r.pickupPrices,[row.pickupMethodId!]:value}}:r)) : updateVariationRow(index, 'price', value)
                                }
                              />
                            </td>
                            <td data-label="Parcelado (18x)">
                              <span
                                className="stock-installment-badge"
                                title="Simulação de 18x com as taxas cadastradas"
                              >
                                {installmentText}
                              </span>
                            </td>
                            <td data-label="Quantidade">
                              <CurrencyInput
                                ariaLabel="Quantidade da variação"
                                decimals={qtyDecimals}
                                value={row.qty}
                                disabled={readOnly}
                                onChange={(value) => updateVariationRow(index, 'qty', value)}
                              />
                            </td>
                            <td data-label="Estoque mínimo">
                              <CurrencyInput
                                ariaLabel="Estoque mínimo da variação"
                                decimals={qtyDecimals}
                                value={row.minQty}
                                disabled={readOnly}
                                onChange={(value) => updateVariationRow(index, 'minQty', value)}
                              />
                            </td>
                            <td data-label="Margem / markup"><ProductPriceMetrics cost={row.cost} price={rowPrice}/></td>
                            <td data-label="Sugestão de venda"><ProductPriceSuggestion compact price={rowPrice} itemLabel={[form.name,...Object.values(row.attrs??{}),pickupMethods.find(method=>method.id===row.pickupMethodId)?.name].filter(Boolean).join(' · ')} cost={row.cost} policy={row.pricingPolicy} disabled={readOnly} onChange={pricingPolicy=>setVariations(current=>current.map((r,i)=>i===index?{...r,pricingPolicy}:r))} onApply={price=>setVariations(current=>current.map((r,i)=>i===index?(r.pickupMethodId?{...r,pickupPrices:{...r.pickupPrices,[r.pickupMethodId]:price}}:{...r,price}):r))}/></td>
                            <td data-label="Última entrada / nota"><LastStockEntry entry={row.lastEntry}/></td>
                            {!readOnly ? (
                              <td className="col-actions" data-label="Ações">
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
                    {Math.min(...variations.map((r) => Number(r.pickupMethodId ? r.pickupPrices?.[r.pickupMethodId] ?? r.price : r.price) || 0)).toFixed(2)} até R${' '}
                    {Math.max(...variations.map((r) => Number(r.pickupMethodId ? r.pickupPrices?.[r.pickupMethodId] ?? r.price : r.price) || 0)).toFixed(2)}
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
                  <Link to={specsPath('atributos')}>Atributos</Link>
                  .
                </p>
                {!readOnly ? (
                  <p className="quick-field__actions" style={{ margin: '0 0 10px' }}>
                    <QuickAddButton label="Novo atributo" onClick={() => setQuickCreate('attribute')} />
                  </p>
                ) : null}
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
                    <CurrencyInput
                      decimals={qtyDecimals}
                      value={form.qty}
                      disabled={readOnly}
                      onChange={(qty) => setForm((current) => ({ ...current, qty }))}
                    />
                  </label>
                  <label>
                    Mínimo
                    <CurrencyInput
                      decimals={qtyDecimals}
                      value={form.minQty}
                      disabled={readOnly}
                      onChange={(minQty) => setForm((current) => ({ ...current, minQty }))}
                    />
                  </label>
                  {!lite ? (
                    <label>
                      Máximo
                      <CurrencyInput
                        decimals={qtyDecimals}
                        value={form.maxQty}
                        disabled={readOnly}
                        onChange={(maxQty) => setForm((current) => ({ ...current, maxQty }))}
                      />
                    </label>
                  ) : null}
                </div>
              </article>

              <article className="admin-card stock-form-card">
                <h3>Preços e custos</h3>
                <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>

                    <label>
                      Custo unitário de referência
                      <CurrencyInput
                        value={form.cost}
                        disabled={readOnly}
                        onChange={(cost) =>
                          setForm((current) => ({
                            ...current,
                            cost,
                            avgCost: current.avgCost || cost,
                            lastPurchaseCost: cost,
                          }))
                        }
                      />
                    </label>


                    <label>
                      Custo médio
                      <CurrencyInput
                        value={form.avgCost}
                        disabled={readOnly}
                        onChange={(avgCost) => setForm((current) => ({ ...current, avgCost }))}
                      />
                    </label>

                  <label>
                    Preço base
                    <CurrencyInput
                      value={form.price}
                      disabled={readOnly}
                      onChange={(price) => setForm((current) => ({ ...current, price }))}
                    />
                  </label>
                  <div className="span-2"><ProductPriceSuggestion price={form.price} itemLabel={form.name||'Produto'} cost={form.cost} policy={form.pricingPolicy} disabled={readOnly} onChange={pricingPolicy=>setForm(current=>({...current,pricingPolicy}))} onApply={price=>setForm(current=>({...current,price}))}/></div>
                  {form.price > 0 ? (
                    <p className="empty span-2" style={{ marginTop: 2, marginBottom: 4 }}>
                      <strong>Simulação Totem (18×):</strong> {formatInstallment(form.price, 18)}{' '}
                      <span style={{ fontSize: '0.82rem' }}>
                        (baseado na maquininha padrão: {getTotemCardRate(18).brandName} a{' '}
                        {getTotemCardRate(18).rate.toFixed(2).replace('.', ',')}% — configure em{' '}
                        <Link to="/painel/taxas-cartao" style={{ textDecoration: 'underline' }}>
                          Taxas de Cartão
                        </Link>
                        )
                      </span>
                    </p>
                  ) : null}
                  <div className="span-2"><ProductPriceMetrics cost={form.cost} price={form.price}/></div>
                  <div className="span-2"><h4>Última entrada de estoque</h4><LastStockEntry entry={form.lastEntry}/></div>
                </div>
              </article>
            </>
          )}

          <ProductDayOffers stockId={selectedId} name={form.name} variations={useVariations ? variations : []} basePrice={form.price}/>

          {!lite || totemSurface ? (
            <article className="admin-card stock-form-card">
              <h3>Fiscal e logística</h3>
              <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
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
    skuAuto:true,pricingPolicy:null,lastEntry:null,
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
