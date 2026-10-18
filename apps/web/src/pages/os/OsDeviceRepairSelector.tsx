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
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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
  return service.price === null || service.price === undefined ? 'Sob avaliação' : repairMoney(service.price);
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
  const [selectedDeviceKey, setSelectedDeviceKey] = useState('');
  const [choices, setChoices] = useState<SelectedRepairChoice[]>([]);

  useEffect(() => {
    setChoices([]);
    setSelectedDeviceKey('');
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
          setServices(srvList.filter((s) => s.active !== false));
          setStock(
            (stockList as unknown as StockRow[]).map((row) => ({
              id: row.id,
              name: row.name,
              brand: row.brand,
              kind: row.kind,
              qty: row.qty,
            })),
          );
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

  // Lista unificada de aparelhos: primeiro os que possuem manutenções cadastradas, depois os do estoque
  const devices = useMemo(() => {
    const map = new Map<string, DeviceEntry>();

    for (const srv of services) {
      const key = deviceKey(srv.productId, srv.brand, srv.model);
      const existing = map.get(key);
      if (existing) {
        existing.serviceCount += 1;
      } else {
        map.set(key, {
          key,
          productId: srv.productId,
          brand: srv.brand,
          model: srv.model,
          displayName: buildDisplayName(srv.brand, srv.model),
          serviceCount: 1,
        });
      }
    }

    for (const row of stock) {
      const bName = resolveBrandName(row.brand);
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
      if (b.serviceCount !== a.serviceCount) return b.serviceCount - a.serviceCount;
      return a.displayName.localeCompare(b.displayName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, stock, brands]);

  const devicePickerOptions = useMemo(
    () => [
      { value: '', label: 'Digitar equipamento manualmente ou selecionar da lista…' },
      ...devices.map((d) => ({
        value: d.key,
        label: d.displayName,
        hint:
          d.serviceCount > 0
            ? `${d.serviceCount} ${d.serviceCount === 1 ? 'manutenção' : 'manutenções'}`
            : d.brand || 'Produto',
        keywords: `${d.brand} ${d.model}`,
      })),
    ],
    [devices],
  );

  // Serviços disponíveis para o aparelho selecionado (ou correspondente ao marca/modelo digitado)
  const matchingServices = useMemo(() => {
    const chosenDevice = devices.find((d) => d.key === selectedDeviceKey);
    const targetBrand = norm(chosenDevice?.brand || itemBrand);
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
        if (sModel.length >= 3 && (norm(itemName).includes(sModel) || norm(itemModel).includes(sModel))) {
          return !targetBrand || !sBrand || sBrand === targetBrand;
        }
        return false;
      })
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }, [services, devices, selectedDeviceKey, itemBrand, itemModel, itemName]);

  // Opções para adicionar rapidamente qualquer serviço do catálogo mesmo sem filtro de aparelho
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

  function emitChanges(nextChoices: SelectedRepairChoice[]) {
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

    const totalPrice = resolved.reduce((sum, item) => sum + (typeof item.price === 'number' ? item.price : 0), 0);
    const totalCost = resolved.reduce((sum, item) => sum + (typeof item.cost === 'number' ? item.cost : 0), 0);
    const hasEvaluationItem = resolved.some((item) => item.price === null || item.price === undefined);
    const maxEstimatedMinutes = Math.max(0, ...resolved.map((item) => item.service.estimatedMinutes ?? 0));
    const summaryText = resolved.map((item) => item.label).join('; ');
    const quoteNotes = resolved
      .map(
        (item) =>
          `${item.label} — ${
            item.price !== null && item.price !== undefined ? repairMoney(item.price) : 'Sob avaliação'
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
      maxEstimatedMinutes,
      summaryText,
      quoteNotes,
      lines,
    });
  }

  function handlePickDevice(key: string) {
    setSelectedDeviceKey(key);
    const dev = devices.find((d) => d.key === key);
    if (!dev) return;
    onSelectDevice({
      itemName: dev.displayName,
      itemBrand: dev.brand,
      itemModel: dev.model,
    });
    setChoices([]);
    emitChanges([]);
  }

  function toggleService(service: RepairService) {
    const exists = choices.some((c) => c.serviceId === service.id);
    const opts = getActiveOptions(service);
    const defaultOptId = opts.length > 0 ? (opts[0].id ?? '0') : null;
    const next = exists
      ? choices.filter((c) => c.serviceId !== service.id)
      : [...choices, { serviceId: service.id, optionId: defaultOptId }];
    setChoices(next);
    emitChanges(next);
  }

  function selectServiceOption(serviceId: string, optionId: string) {
    const exists = choices.some((c) => c.serviceId === serviceId);
    const next = exists
      ? choices.map((c) => (c.serviceId === serviceId ? { ...c, optionId } : c))
      : [...choices, { serviceId, optionId }];
    setChoices(next);
    emitChanges(next);
  }

  function handleAddFromGlobalPicker(val: string) {
    if (!val) return;
    const [serviceId, optIdRaw] = val.split('|');
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;

    // Se o aparelho ainda estiver em branco, preenche com o aparelho desse serviço
    if (!itemName.trim() && (service.brand || service.model)) {
      const devDisplay = buildDisplayName(service.brand, service.model);
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
    emitChanges(next);
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

  // Serviços escolhidos pelo picker global que não fazem parte de matchingServices
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
      <div className="os-repair-catalog-box__top">
        <div className="os-repair-catalog-box__picker">
          <AdminPicker
            label="Aparelho do Catálogo de Manutenções / Produtos"
            value={selectedDeviceKey}
            searchable
            placeholder={
              loading
                ? 'Carregando aparelhos e catálogo de manutenções…'
                : 'Selecione o aparelho (ex.: iPhone 15, Galaxy S23) para carregar os serviços e preços…'
            }
            options={devicePickerOptions}
            onChange={handlePickDevice}
          />
        </div>
        <Link
          to={osHref(osBase, '/manutencoes')}
          className="btn btn--ghost btn--sm os-repair-catalog-box__manage-link"
          title="Abrir Catálogo de Manutenções para cadastrar ou editar preços"
        >
          ⚙️ Catálogo de Manutenções
        </Link>
      </div>

      {displayedServices.length > 0 ? (
        <div className="os-repair-services-panel">
          <div className="os-repair-services-panel__head">
            <div>
              <strong>
                🛠️ Serviços / Manutenções disponíveis ({displayedServices.length})
              </strong>
              <span>
                Clique nos serviços desejados para preencher o defeito e configurar o preço automaticamente
              </span>
            </div>
            {chosenSummary.length > 0 ? (
              <div className="os-repair-services-panel__total">
                <span>
                  {chosenSummary.length}{' '}
                  {chosenSummary.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}
                </span>
                <strong>{repairMoney(totalSelectedPrice)}</strong>
              </div>
            ) : null}
          </div>

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
                        Peça / Qualidade:
                      </span>
                      <div className="os-repair-srv-card__options-list">
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
                                  ? 'Avaliar'
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
        </div>
      ) : services.length > 0 ? (
        <div className="os-repair-services-empty">
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <AdminPicker
              compact
              searchable
              label="Buscar serviço no Catálogo de Manutenções"
              value=""
              placeholder="Pesquisar serviço cadastrado (ex.: Troca de Tela, Bateria, Conector)…"
              options={allServicesPickerOptions}
              onChange={handleAddFromGlobalPicker}
            />
          </div>
          <span className="os-repair-services-empty__hint">
            Selecione um aparelho acima ou busque qualquer serviço cadastrado em{' '}
            <Link to={osHref(osBase, '/manutencoes')}>/os/manutencoes</Link> para preencher o valor automaticamente.
          </span>
        </div>
      ) : null}
    </div>
  );
}
