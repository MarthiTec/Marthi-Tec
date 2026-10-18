import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { findBrand, useBrands } from '../../data/brandStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import type { WorkOrderLine } from '../../data/osStore';
import { apiListStock } from '../../services/erpApi';
import {
  apiListRepairServices,
  repairDuration,
  repairMoney,
  type RepairOption,
  type RepairService,
} from '../../services/repairsApi';
import { osHref, useOsBase } from './osPaths';

type StockRow = { id: string; name: string; brand?: string; kind?: string; qty?: number };

export type SelectedRepairChoice = {
  serviceId: string;
  optionId: string | null;
};

export type OsRepairSelectionResult = {
  totalPrice: number;
  totalCost: number;
  hasEvaluationItem: boolean;
  wantsDiagnosis: boolean;
  maxEstimatedMinutes: number;
  summaryText: string;
  quoteNotes: string;
  lines: WorkOrderLine[];
};

type DeviceEntry = {
  key: string;
  productId: string | null;
  brand: string;
  model: string;
  displayName: string;
  serviceCount: number;
};

type Props = {
  itemName: string;
  itemBrand: string;
  itemModel: string;
  onSelectDevice: (device: { itemName: string; itemBrand: string; itemModel: string }) => void;
  onSelectionChange: (result: OsRepairSelectionResult) => void;
  resetSignal?: number;
};

function norm(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

function deviceKey(productId: string | null, brand: string, model: string) {
  if (productId) return `p:${productId}`;
  return `m:${norm(brand)}\u0000${norm(model)}`;
}

function buildDisplayName(brand: string, model: string) {
  const b = brand.trim();
  const m = model.trim();
  if (!b) return m;
  if (!m) return b;
  if (norm(m).startsWith(norm(b))) return m;
  return `${b} ${m}`;
}

function getActiveOptions(service: RepairService): RepairOption[] {
  return (service.options || []).filter((opt) => opt.active !== false);
}

function servicePriceBadge(service: RepairService): string {
  const opts = getActiveOptions(service);
  if (opts.length > 0) {
    const priced = opts.map((o) => o.price).filter((p): p is number => p !== null && p !== undefined);
    return priced.length > 0 ? `a partir de ${repairMoney(Math.min(...priced))}` : 'Sob avaliação';
  }
  return service.price === null || service.price === undefined
    ? 'Sob avaliação'
    : repairMoney(service.price);
}

export function OsDeviceRepairSelector({
  itemName,
  itemBrand,
  itemModel,
  onSelectDevice,
  onSelectionChange,
  resetSignal = 0,
}: Props) {
  const osBase = useOsBase();
  const { brands } = useBrands();
  const [services, setServices] = useState<RepairService[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedDeviceKey, setSelectedDeviceKey] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [wantsDiagnosis, setWantsDiagnosis] = useState(false);
  const [choices, setChoices] = useState<SelectedRepairChoice[]>([]);

  useEffect(() => {
    setChoices([]);
    setSelectedBrand('');
    setSelectedDeviceKey('');
    setManualMode(false);
    setWantsDiagnosis(false);
  }, [resetSignal]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      Promise.all([
        apiListRepairServices().catch(() => [] as RepairService[]),
        apiListStock().catch(() => []),
      ])
        .then(([srvList, stockList]) => {
          if (!alive) return;
          const activeServices = srvList.filter((s) => s.active !== false);
          setServices(activeServices);
          setStock(
            (stockList as unknown as StockRow[]).map((row) => ({
              id: row.id,
              name: row.name,
              brand: row.brand,
              kind: row.kind,
              qty: row.qty,
            })),
          );
          // Se houver apenas 1 marca cadastrada no catálogo de manutenções, já pré-seleciona
          const uniqueRepairBrands = [...new Set(activeServices.map((s) => s.brand.trim()).filter(Boolean))];
          if (uniqueRepairBrands.length === 1) {
            setSelectedBrand((prev) => prev || uniqueRepairBrands[0]);
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, []);

  const resolveBrandName = (value?: string) =>
    findBrand(brands, value)?.name ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

  // Lista unificada de aparelhos: primeiro os que possuem manutenções cadastradas em /os/manutencoes, depois os do estoque
  const devices = useMemo(() => {
    const map = new Map<string, DeviceEntry>();

    for (const srv of services) {
      const b = srv.brand.trim();
      const m = srv.model.trim();
      const key = deviceKey(srv.productId, b, m);
      const existing = map.get(key);
      if (existing) {
        existing.serviceCount += 1;
      } else {
        map.set(key, {
          key,
          productId: srv.productId,
          brand: b,
          model: m,
          displayName: buildDisplayName(b, m),
          serviceCount: 1,
        });
      }
    }

    for (const row of stock) {
      // Peças e insumos (telas, baterias…) não são aparelhos: aparecem nas peças da OS, não aqui.
      if (row.kind === 'part' || row.kind === 'supply') continue;
      const bName = resolveBrandName(row.brand).trim();
      const keyByProd = deviceKey(row.id, bName, row.name);
      const keyByModel = deviceKey(null, bName, row.name);
      if (!map.has(keyByProd) && !map.has(keyByModel)) {
        map.set(keyByProd, {
          key: keyByProd,
          productId: row.id,
          brand: bName,
          model: row.name,
          displayName: buildDisplayName(bName, row.name),
          serviceCount: 0,
        });
      }
    }

    return [...map.values()].sort((a, b) => {
      if ((a.serviceCount > 0) !== (b.serviceCount > 0)) {
        return a.serviceCount > 0 ? -1 : 1;
      }
      return naturalCompare(a.displayName, b.displayName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, stock, brands]);

  // Lista de marcas (priorizando marcas com manutenções no catálogo)
  const brandOptions = useMemo(() => {
    const brandMap = new Map<string, { brand: string; modelCount: number; serviceCount: number }>();
    for (const dev of devices) {
      const b = dev.brand.trim();
      if (!b) continue;
      const k = norm(b);
      const prev = brandMap.get(k);
      if (prev) {
        prev.modelCount += 1;
        prev.serviceCount += dev.serviceCount;
      } else {
        brandMap.set(k, { brand: b, modelCount: 1, serviceCount: dev.serviceCount });
      }
    }
    const sorted = [...brandMap.values()].sort((a, b) => {
      if ((a.serviceCount > 0) !== (b.serviceCount > 0)) {
        return a.serviceCount > 0 ? -1 : 1;
      }
      return naturalCompare(a.brand, b.brand);
    });

    return [
      { value: '', label: 'Todas as marcas' },
      ...sorted.map((entry) => ({
        value: entry.brand,
        label: entry.brand,
        hint:
          entry.serviceCount > 0
            ? `${entry.modelCount} ${entry.modelCount === 1 ? 'aparelho' : 'aparelhos'} · ${entry.serviceCount} ${entry.serviceCount === 1 ? 'serviço' : 'serviços'}`
            : `${entry.modelCount} ${entry.modelCount === 1 ? 'produto' : 'produtos'}`,
      })),
      { value: '__manual__', label: '✏️ Outra marca (digitar manualmente)…' },
    ];
  }, [devices]);

  // Modelos filtrados pela marca escolhida
  const filteredDevices = useMemo(() => {
    if (!selectedBrand) return devices;
    const target = norm(selectedBrand);
    return devices.filter((d) => norm(d.brand) === target);
  }, [devices, selectedBrand]);

  const devicePickerOptions = useMemo(
    () => [
      {
        value: '',
        label: selectedBrand
          ? `Selecione o modelo de ${selectedBrand}…`
          : 'Selecione o aparelho / modelo da lista…',
      },
      ...filteredDevices.map((d) => ({
        value: d.key,
        label: selectedBrand ? d.model : d.displayName,
        hint:
          d.serviceCount > 0
            ? `${d.serviceCount} ${d.serviceCount === 1 ? 'manutenção tabelada' : 'manutenções tabeladas'}`
            : d.brand || 'Estoque',
        keywords: `${d.brand} ${d.model} ${d.displayName}`,
      })),
      { value: '__manual__', label: '✏️ Outro aparelho (digitar manualmente)…' },
    ],
    [filteredDevices, selectedBrand],
  );

  // Serviços disponíveis para o aparelho selecionado (ou correspondente ao marca/modelo)
  const matchingServices = useMemo(() => {
    const chosenDevice = devices.find((d) => d.key === selectedDeviceKey);
    const targetBrand = norm(chosenDevice?.brand || selectedBrand || itemBrand);
    const targetModel = norm(chosenDevice?.model || itemModel || itemName);
    const targetProductId = chosenDevice?.productId || null;

    if (!targetModel && !targetProductId) return [];

    return services
      .filter((srv) => {
        if (targetProductId && srv.productId === targetProductId) return true;
        const sBrand = norm(srv.brand);
        const sModel = norm(srv.model);
        const sFull = norm(buildDisplayName(srv.brand, srv.model));
        if (targetBrand && sBrand === targetBrand && sModel === targetModel) return true;
        if (sModel && (targetModel === sModel || sFull === targetModel)) return true;
        if (
          sModel.length >= 3 &&
          (norm(itemName).includes(sModel) || norm(itemModel).includes(sModel))
        ) {
          return !targetBrand || !sBrand || sBrand === targetBrand;
        }
        return false;
      })
      .sort((a, b) => a.sort - b.sort || naturalCompare(a.name, b.name));
  }, [services, devices, selectedDeviceKey, selectedBrand, itemBrand, itemModel, itemName]);

  // Opções para buscar rapidamente qualquer serviço do catálogo
  const allServicesPickerOptions = useMemo(() => {
    return services.flatMap((service) => {
      const opts = getActiveOptions(service);
      const devLabel = buildDisplayName(service.brand, service.model);
      if (opts.length > 0) {
        return opts.map((opt, idx) => ({
          value: `${service.id}|${opt.id ?? idx}`,
          label: `${service.name} (${opt.name})`,
          hint: `${devLabel} · ${opt.price === null ? 'Sob avaliação' : repairMoney(opt.price)}`,
          keywords: `${devLabel} ${service.category} ${service.name} ${opt.name}`,
        }));
      }
      return [
        {
          value: `${service.id}|`,
          label: service.name,
          hint: `${devLabel} · ${service.price === null ? 'Sob avaliação' : repairMoney(service.price)}`,
          keywords: `${devLabel} ${service.category} ${service.name}`,
        },
      ];
    });
  }, [services]);

  function emitChanges(nextChoices: SelectedRepairChoice[], nextDiagnosis = wantsDiagnosis) {
    if (nextDiagnosis && nextChoices.length === 0) {
      onSelectionChange({
        totalPrice: 0,
        totalCost: 0,
        hasEvaluationItem: true,
        wantsDiagnosis: true,
        maxEstimatedMinutes: 0,
        summaryText: 'Avaliação técnica — identificar defeito na bancada',
        quoteNotes: 'Avaliação técnica presencial solicitada na abertura da OS.',
        lines: [],
      });
      return;
    }

    const resolved = nextChoices
      .map((choice) => {
        const service = services.find((s) => s.id === choice.serviceId);
        if (!service) return null;
        const opts = getActiveOptions(service);
        const option =
          opts.find((o, idx) => (o.id ?? String(idx)) === choice.optionId) ??
          (opts.length > 0 ? opts[0] : null);
        const price = option ? option.price : service.price;
        const cost = option ? (option.cost ?? service.cost ?? 0) : (service.cost ?? 0);
        const label = option ? `${service.name} (${option.name})` : service.name;
        const stockId = option?.stockItemId || '';
        return {
          service,
          option,
          price,
          cost: cost ?? 0,
          label,
          stockId,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const totalPrice = resolved.reduce(
      (sum, item) => sum + (typeof item.price === 'number' ? item.price : 0),
      0,
    );
    const totalCost = resolved.reduce(
      (sum, item) => sum + (typeof item.cost === 'number' ? item.cost : 0),
      0,
    );
    const hasEvaluationItem = resolved.some(
      (item) => item.price === null || item.price === undefined,
    );
    const maxEstimatedMinutes = Math.max(
      0,
      ...resolved.map((item) => item.service.estimatedMinutes ?? 0),
    );
    const summaryText = resolved.map((item) => item.label).join('; ');
    const quoteNotes = resolved
      .map(
        (item) =>
          `${item.label} — ${
            item.price !== null && item.price !== undefined
              ? repairMoney(item.price)
              : 'Sob avaliação'
          }`,
      )
      .join('\n');

    const lines: WorkOrderLine[] = resolved.map((item, idx) => ({
      id: `srv-${item.service.id}-${idx}`,
      stockId: item.stockId,
      name: item.label,
      qty: 1,
      unitCost: Number(item.cost) || 0,
      unitPrice: Number(item.price) || 0,
      kind: 'labor',
    }));

    onSelectionChange({
      totalPrice,
      totalCost,
      hasEvaluationItem,
      wantsDiagnosis: false,
      maxEstimatedMinutes,
      summaryText,
      quoteNotes,
      lines,
    });
  }

  function handlePickBrand(brandVal: string) {
    if (brandVal === '__manual__') {
      setManualMode(true);
      return;
    }
    setManualMode(false);
    setSelectedBrand(brandVal);
    setSelectedDeviceKey('');
    setChoices([]);
    setWantsDiagnosis(false);
    emitChanges([], false);
    onSelectDevice({
      itemName: '',
      itemBrand: brandVal,
      itemModel: '',
    });
  }

  function handlePickDevice(key: string) {
    if (key === '__manual__') {
      setManualMode(true);
      setSelectedDeviceKey('');
      return;
    }
    setManualMode(false);
    setSelectedDeviceKey(key);
    const dev = devices.find((d) => d.key === key);
    if (!dev) return;
    if (dev.brand) setSelectedBrand(dev.brand);
    onSelectDevice({
      itemName: dev.displayName,
      itemBrand: dev.brand,
      itemModel: dev.model,
    });
    setChoices([]);
    setWantsDiagnosis(false);
    emitChanges([], false);
  }

  function toggleDiagnosis() {
    const next = !wantsDiagnosis;
    setWantsDiagnosis(next);
    if (next) {
      setChoices([]);
      emitChanges([], true);
    } else {
      emitChanges([], false);
    }
  }

  function toggleService(service: RepairService) {
    setWantsDiagnosis(false);
    const exists = choices.some((c) => c.serviceId === service.id);
    const opts = getActiveOptions(service);
    const defaultOptId = opts.length > 0 ? (opts[0].id ?? '0') : null;
    const next = exists
      ? choices.filter((c) => c.serviceId !== service.id)
      : [...choices, { serviceId: service.id, optionId: defaultOptId }];
    setChoices(next);
    emitChanges(next, false);
  }

  function selectServiceOption(serviceId: string, optionId: string) {
    setWantsDiagnosis(false);
    const exists = choices.some((c) => c.serviceId === serviceId);
    const next = exists
      ? choices.map((c) => (c.serviceId === serviceId ? { ...c, optionId } : c))
      : [...choices, { serviceId, optionId }];
    setChoices(next);
    emitChanges(next, false);
  }

  function handleAddFromGlobalPicker(val: string) {
    if (!val) return;
    const [serviceId, optIdRaw] = val.split('|');
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;

    setWantsDiagnosis(false);
    if (service.brand || service.model) {
      const devDisplay = buildDisplayName(service.brand, service.model);
      setSelectedBrand(service.brand);
      onSelectDevice({
        itemName: devDisplay,
        itemBrand: service.brand,
        itemModel: service.model,
      });
      const devKey = deviceKey(service.productId, service.brand, service.model);
      setSelectedDeviceKey(devKey);
    }

    const optionId = optIdRaw ? optIdRaw : null;
    const exists = choices.some((c) => c.serviceId === serviceId);
    const next = exists
      ? choices.map((c) => (c.serviceId === serviceId ? { ...c, optionId } : c))
      : [...choices, { serviceId, optionId }];
    setChoices(next);
    emitChanges(next, false);
  }

  const chosenSummary = useMemo(() => {
    return choices
      .map((c) => {
        const srv = services.find((s) => s.id === c.serviceId);
        if (!srv) return null;
        const opts = getActiveOptions(srv);
        const opt =
          opts.find((o, idx) => (o.id ?? String(idx)) === c.optionId) ??
          (opts.length > 0 ? opts[0] : null);
        const price = opt ? opt.price : srv.price;
        return {
          serviceId: srv.id,
          label: opt ? `${srv.name} (${opt.name})` : srv.name,
          price,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [choices, services]);

  const totalSelectedPrice = chosenSummary.reduce(
    (sum, item) => sum + (typeof item.price === 'number' ? item.price : 0),
    0,
  );

  const extraChosenServices = useMemo(() => {
    const matchIds = new Set(matchingServices.map((s) => s.id));
    return choices
      .map((c) => services.find((s) => s.id === c.serviceId))
      .filter((s): s is RepairService => Boolean(s) && !matchIds.has(s!.id));
  }, [choices, services, matchingServices]);

  const displayedServices = useMemo(
    () => [...matchingServices, ...extraChosenServices],
    [matchingServices, extraChosenServices],
  );

  return (
    <div className="os-repair-catalog-box">
      <div className="os-repair-catalog-box__head">
        <div>
          <strong className="os-repair-catalog-box__title">
            📱 1. Selecione o Aparelho
          </strong>
          <small className="os-repair-catalog-box__subtitle">
            Escolha a marca e o modelo para carregar os serviços e preços tabelados de{' '}
            <Link to={osHref(osBase, '/manutencoes')}>/os/manutencoes</Link>
          </small>
        </div>
        <div className="os-repair-catalog-box__actions">
          <button
            type="button"
            className={`btn btn--ghost btn--sm ${manualMode ? 'is-active' : ''}`}
            onClick={() => setManualMode((m) => !m)}
          >
            {manualMode ? '📋 Usar lista do catálogo' : '✏️ Digitar aparelho manualmente'}
          </button>
          <Link
            to={osHref(osBase, '/manutencoes')}
            className="btn btn--ghost btn--sm"
            title="Abrir Catálogo de Manutenções para cadastrar ou editar serviços e preços"
          >
            ⚙️ Catálogo de Manutenções
          </Link>
        </div>
      </div>

      {/* Seleção de Marca e Modelo (padrão) ou Digitação Manual */}
      {!manualMode && devices.length > 0 ? (
        <div className="os-repair-catalog-box__pickers">
          <AdminPicker
            label="Marca do Aparelho"
            value={selectedBrand}
            searchable
            placeholder={loading ? 'Carregando marcas…' : 'Selecione a marca (ex.: Apple, Samsung)…'}
            options={brandOptions}
            onChange={handlePickBrand}
          />
          <AdminPicker
            label="Modelo / Aparelho *"
            value={selectedDeviceKey}
            searchable
            placeholder={
              loading
                ? 'Carregando modelos…'
                : selectedBrand
                  ? `Selecione o modelo de ${selectedBrand}…`
                  : 'Selecione o aparelho (ex.: iPhone 13, Galaxy A12)…'
            }
            options={devicePickerOptions}
            onChange={handlePickDevice}
          />
        </div>
      ) : (
        <div className="os-form-grid os-form-grid--3">
          <label>
            <span>Marca *</span>
            <input
              value={itemBrand}
              onChange={(e) => {
                const nextBrand = e.target.value;
                const nextDisplay = buildDisplayName(nextBrand, itemModel) || itemName;
                onSelectDevice({ itemName: nextDisplay, itemBrand: nextBrand, itemModel });
              }}
              placeholder="Ex.: Apple, Samsung, Motorola"
            />
          </label>
          <label>
            <span>Modelo *</span>
            <input
              value={itemModel}
              onChange={(e) => {
                const nextModel = e.target.value;
                const nextDisplay = buildDisplayName(itemBrand, nextModel);
                onSelectDevice({ itemName: nextDisplay, itemBrand, itemModel: nextModel });
              }}
              placeholder="Ex.: iPhone 15, Galaxy S23"
            />
          </label>
          <label>
            <span>Descrição do Equipamento *</span>
            <input
              value={itemName}
              onChange={(e) =>
                onSelectDevice({ itemName: e.target.value, itemBrand, itemModel })
              }
              placeholder="Ex.: Apple iPhone 15 128GB"
              required
            />
          </label>
        </div>
      )}

      {/* Painel 2: Qual manutenção / serviço será feito? */}
      <div className="os-repair-services-panel">
        <div className="os-repair-services-panel__head">
          <div>
            <strong className="os-repair-services-panel__title">
              🛠️ 2. Qual manutenção você precisa? (Tipo de Serviço)
              {displayedServices.length > 0 ? ` · ${displayedServices.length} disponíveis` : ''}
            </strong>
            <span className="os-repair-services-panel__subtitle">
              Clique nos serviços abaixo para configurar automaticamente o tipo de serviço e o preço da OS
            </span>
          </div>
          {chosenSummary.length > 0 ? (
            <div className="os-repair-services-panel__total">
              <span>
                {chosenSummary.length}{' '}
                {chosenSummary.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}:
              </span>
              <strong>{repairMoney(totalSelectedPrice)}</strong>
            </div>
          ) : wantsDiagnosis ? (
            <div className="os-repair-services-panel__total">
              <span>Modo selecionado:</span>
              <strong>Avaliação técnica</strong>
            </div>
          ) : null}
        </div>

        {/* Opção "Não sei o que é / Avaliação técnica" igual ao fluxo do catálogo */}
        <button
          type="button"
          className={`os-repair-diagnosis-btn ${wantsDiagnosis ? 'is-selected' : ''}`}
          onClick={toggleDiagnosis}
          aria-pressed={wantsDiagnosis}
        >
          <span className="os-repair-srv-card__check" aria-hidden="true">
            {wantsDiagnosis ? '✓' : '?'}
          </span>
          <span className="os-repair-diagnosis-btn__text">
            <strong>Não sei o que é / Avaliação técnica na bancada</strong>
            <small>
              O aparelho precisa de diagnóstico do técnico antes de definir o serviço e o orçamento final
            </small>
          </span>
          <span className="os-repair-diagnosis-btn__tag">Avaliação técnica</span>
        </button>

        {displayedServices.length > 0 ? (
          <div className="os-repair-services-grid">
            {displayedServices.map((service) => {
              const choice = choices.find((c) => c.serviceId === service.id);
              const isSelected = Boolean(choice);
              const opts = getActiveOptions(service);
              const durationLabel = repairDuration(service.estimatedMinutes);

              return (
                <div
                  key={service.id}
                  className={`os-repair-srv-card ${isSelected ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="os-repair-srv-card__main"
                    onClick={() => toggleService(service)}
                    aria-pressed={isSelected}
                  >
                    <span className="os-repair-srv-card__check" aria-hidden="true">
                      {isSelected ? '✓' : '+'}
                    </span>
                    <span className="os-repair-srv-card__info">
                      <strong>{service.name}</strong>
                      <small>
                        {[service.category, durationLabel ? `⏱ ${durationLabel}` : '']
                          .filter(Boolean)
                          .join(' · ') || 'Manutenção tabelada'}
                      </small>
                    </span>
                    <span className="os-repair-srv-card__price">
                      {servicePriceBadge(service)}
                    </span>
                  </button>

                  {opts.length > 0 && isSelected ? (
                    <div className="os-repair-srv-card__options">
                      <span className="os-repair-srv-card__options-label">
                        Escolha a peça / qualidade:
                      </span>
                      <div className="os-repair-srv-card__options-pills">
                        {opts.map((opt, idx) => {
                          const optKey = opt.id ?? String(idx);
                          const optActive = (choice?.optionId ?? (opts[0].id ?? '0')) === optKey;
                          return (
                            <button
                              key={optKey}
                              type="button"
                              className={`os-repair-opt-pill ${optActive ? 'is-active' : ''}`}
                              onClick={() => selectServiceOption(service.id, optKey)}
                            >
                              <span>{opt.name}</span>
                              <strong>
                                {opt.price === null || opt.price === undefined
                                  ? 'Sob avaliação'
                                  : repairMoney(opt.price)}
                              </strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Busca rápida de qualquer serviço do catálogo */}
        {services.length > 0 ? (
          <div className="os-repair-services-search-row">
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <AdminPicker
                compact
                searchable
                label={
                  displayedServices.length > 0
                    ? 'Adicionar outro serviço do Catálogo de Manutenções'
                    : 'Buscar serviço diretamente no Catálogo de Manutenções'
                }
                value=""
                placeholder="Pesquisar serviço cadastrado (ex.: Troca de Tela, Bateria, Conector)…"
                options={allServicesPickerOptions}
                onChange={handleAddFromGlobalPicker}
              />
            </div>
          </div>
        ) : !loading ? (
          <div className="os-repair-services-empty">
            Nenhum serviço cadastrado ainda em{' '}
            <Link to={osHref(osBase, '/manutencoes')}>/os/manutencoes</Link>. Cadastre os serviços por
            aparelho lá para selecioná-los com 1 clique aqui.
          </div>
        ) : null}

        {/* Resumo dos serviços selecionados */}
        {chosenSummary.length > 0 ? (
          <div className="os-repair-summary-bar">
            <div className="os-repair-summary-bar__items">
              {chosenSummary.map((item) => (
                <span key={item.serviceId} className="os-repair-summary-chip">
                  ✓ {item.label}{' '}
                  <strong>
                    {item.price !== null && item.price !== undefined
                      ? repairMoney(item.price)
                      : 'Sob avaliação'}
                  </strong>
                </span>
              ))}
            </div>
            <div className="os-repair-summary-bar__total">
              <span>Valor configurado na OS:</span>
              <strong>{repairMoney(totalSelectedPrice)}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
