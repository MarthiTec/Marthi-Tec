import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { submitTotemLead } from '../../services/totem';
import { ProductCarousel } from './ProductCarousel';
import { TotemKeyboard } from './TotemKeyboard';
import { TotemPicker } from './TotemPicker';
import {
  FULFILLMENT_OPTIONS,
  INSTALLMENTS,
  PAYMENT_OPTIONS,
  TOTEM_BRANDS,
  TOTEM_PRODUCTS,
  formatBRL,
  type TotemBrand,
  type TotemProduct,
} from './totemData';
import './totem.css';

const EXIT_PASSWORD =
  import.meta.env.VITE_TOTEM_EXIT_PASSWORD?.trim() || 'cellponto';
const FILTER_IDLE_MS = 2 * 60 * 1000;

type Step = 'catalog' | 'checkout' | 'done';
type BrandFilter = TotemBrand | 'all';

type CardConfig = {
  storage: string;
  color: string;
  fulfillment: string;
};

type Selection = {
  product: TotemProduct;
  storage: string;
  color: string;
  fulfillment: string;
  payment: string;
  installment: string;
};

function defaultConfig(product: TotemProduct): CardConfig {
  return {
    storage: product.storages[0],
    color: product.colors[0],
    fulfillment: FULFILLMENT_OPTIONS[0],
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function TotemPage() {
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('catalog');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [search, setSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [filterColor, setFilterColor] = useState('all');
  const [filterStorage, setFilterStorage] = useState('all');
  const [filterFulfillment, setFilterFulfillment] = useState('all');
  const [openFilter, setOpenFilter] = useState<'color' | 'storage' | 'fulfillment' | null>(null);
  const [configs, setConfigs] = useState<Record<number, CardConfig>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleTick, setIdleTick] = useState(0);

  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const hasActiveQuery =
    search.trim() !== '' ||
    filterColor !== 'all' ||
    filterStorage !== 'all' ||
    filterFulfillment !== 'all' ||
    brand !== 'all';

  function bumpIdle() {
    setIdleTick((current) => current + 1);
  }

  function clearCatalogFilters() {
    setSearch('');
    setBrand('all');
    setFilterColor('all');
    setFilterStorage('all');
    setFilterFulfillment('all');
    setOpenFilter(null);
    setKeyboardOpen(false);
  }

  const brandProducts = useMemo(() => {
    return TOTEM_PRODUCTS.filter((item) => brand === 'all' || item.brand === brand);
  }, [brand]);

  const colorOptions = useMemo(
    () => uniqueSorted(brandProducts.flatMap((item) => item.colors)),
    [brandProducts],
  );
  const storageOptions = useMemo(
    () => uniqueSorted(brandProducts.flatMap((item) => item.storages)),
    [brandProducts],
  );

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    return brandProducts.filter((item) => {
      const searchOk = query === '' || item.name.toLowerCase().includes(query);
      const colorOk = filterColor === 'all' || item.colors.includes(filterColor);
      const storageOk = filterStorage === 'all' || item.storages.includes(filterStorage);
      const fulfillmentOk = filterFulfillment === 'all';
      return searchOk && colorOk && storageOk && fulfillmentOk;
    });
  }, [brandProducts, search, filterColor, filterStorage, filterFulfillment]);

  useEffect(() => {
    const scrolling = step === 'catalog';
    document.documentElement.classList.toggle('totem-html-scroll', scrolling);
    document.body.classList.toggle('totem-html-scroll', scrolling);
    return () => {
      document.documentElement.classList.remove('totem-html-scroll');
      document.body.classList.remove('totem-html-scroll');
    };
  }, [step]);

  useEffect(() => {
    if (step === 'catalog') {
      window.scrollTo({ top: 0 });
    }
    listRef.current?.scrollTo({ top: 0 });
  }, [step, brand, search, filterColor, filterStorage, filterFulfillment]);

  useEffect(() => {
    setFilterColor('all');
    setFilterStorage('all');
  }, [brand]);

  useEffect(() => {
    if (step !== 'catalog' || !hasActiveQuery) return;
    const timer = window.setTimeout(() => {
      clearCatalogFilters();
    }, FILTER_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [step, hasActiveQuery, idleTick, search, brand, filterColor, filterStorage, filterFulfillment]);

  useEffect(() => {
    if (!keyboardOpen && !openFilter) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchPanelRef.current?.contains(target)) return;
      setKeyboardOpen(false);
      setOpenFilter(null);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [keyboardOpen, openFilter]);

  function getConfig(product: TotemProduct): CardConfig {
    const base = configs[product.id] ?? defaultConfig(product);
    return {
      ...base,
      color: filterColor !== 'all' && product.colors.includes(filterColor) ? filterColor : base.color,
      storage:
        filterStorage !== 'all' && product.storages.includes(filterStorage)
          ? filterStorage
          : base.storage,
      fulfillment:
        filterFulfillment !== 'all' ? filterFulfillment : base.fulfillment,
    };
  }

  function patchConfig(productId: number, patch: Partial<CardConfig>) {
    setConfigs((current) => {
      const product = TOTEM_PRODUCTS.find((item) => item.id === productId);
      const base = current[productId] ?? (product ? defaultConfig(product) : null);
      if (!base) return current;
      return { ...current, [productId]: { ...base, ...patch } };
    });
  }

  function openCheckout(product: TotemProduct) {
    const config = getConfig(product);
    setSelection({
      product,
      storage: config.storage,
      color: config.color,
      fulfillment: config.fulfillment,
      payment: PAYMENT_OPTIONS[0],
      installment: INSTALLMENTS[0],
    });
    setError(null);
    setKeyboardOpen(false);
    setOpenFilter(null);
    setStep('checkout');
  }

  function resetTotem() {
    setStep('catalog');
    clearCatalogFilters();
    setSelection(null);
    setName('');
    setPhone('');
    setError(null);
    setSubmitting(false);
  }

  function requestExit() {
    setExitPassword('');
    setExitError(null);
    setExitOpen(true);
  }

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== EXIT_PASSWORD) {
      setExitError('Senha incorreta. Só a loja pode fechar o totem.');
      return;
    }
    setExitOpen(false);
    navigate('/');
  }

  function appendSearch(char: string) {
    bumpIdle();
    setSearch((current) => `${current}${char}`.slice(0, 40));
  }

  function backspaceSearch() {
    bumpIdle();
    setSearch((current) => current.slice(0, -1));
  }

  async function handleWhatsAppSubmit() {
    if (!selection) return;
    setError(null);
    setSubmitting(true);

    const priceLabel =
      selection.payment === 'À vista'
        ? formatBRL(selection.product.cashPrice)
        : `${selection.installment} · ${selection.product.installmentLabel}`;

    try {
      await submitTotemLead({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        productName: selection.product.name,
        color: selection.color,
        storage: selection.storage,
        fulfillment: selection.fulfillment,
        payment: selection.payment,
        installment: selection.payment === 'Parcelado' ? selection.installment : null,
        priceLabel,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`totem ${step === 'catalog' ? 'totem--page-scroll' : ''}`}>
      <header className="totem__top">
        <BrandLogo variant="mark" className="totem__mark" />
        <div className="totem__top-meta">
          <strong>Sua Loja</strong>
          <span>Totem Marthi · Shopping</span>
        </div>
        <button type="button" className="totem__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {step === 'catalog' && (
        <section className="totem__floor totem__floor--topnav">
          <div className="totem__stage">
            <div className="totem__search-panel" ref={searchPanelRef}>
              <div className="totem__toolbar totem__toolbar--quiet">
                <div className="totem__brands" role="tablist" aria-label="Marcas">
                  {TOTEM_BRANDS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={brand === item.id}
                      className={`totem-chip ${brand === item.id ? 'is-active' : ''}`}
                      onClick={() => {
                        bumpIdle();
                        setBrand(item.id);
                        setKeyboardOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className={`totem__search-trigger ${search || keyboardOpen ? 'is-active' : ''}`}
                  onClick={() => {
                    bumpIdle();
                    setOpenFilter(null);
                    setKeyboardOpen(true);
                  }}
                >
                  {search || 'Buscar modelo'}
                </button>

                <div className="totem__filters totem__filters--quiet">
                  {(
                    [
                      {
                        id: 'color' as const,
                        label: 'Cor',
                        value: filterColor,
                        options: colorOptions,
                        onChange: setFilterColor,
                      },
                      {
                        id: 'storage' as const,
                        label: 'Capacidade',
                        value: filterStorage,
                        options: storageOptions,
                        onChange: setFilterStorage,
                      },
                      {
                        id: 'fulfillment' as const,
                        label: 'Retirada',
                        value: filterFulfillment,
                        options: [...FULFILLMENT_OPTIONS],
                        onChange: setFilterFulfillment,
                      },
                    ] as const
                  ).map((filter) => (
                    <div key={filter.id} className="totem-filter">
                      <button
                        type="button"
                        className={`totem-filter__label ${filter.value !== 'all' ? 'is-set' : ''} ${openFilter === filter.id ? 'is-open' : ''}`}
                        onClick={() => {
                          bumpIdle();
                          setKeyboardOpen(false);
                          setOpenFilter((current) => (current === filter.id ? null : filter.id));
                        }}
                      >
                        {filter.label}
                        {filter.value !== 'all' ? `: ${filter.value}` : ''}
                      </button>
                      {openFilter === filter.id && (
                        <div className="totem-filter__menu" role="listbox" aria-label={filter.label}>
                          <button
                            type="button"
                            className={filter.value === 'all' ? 'is-active' : ''}
                            onClick={() => {
                              bumpIdle();
                              filter.onChange('all');
                              setOpenFilter(null);
                            }}
                          >
                            Todas
                          </button>
                          {filter.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={filter.value === option ? 'is-active' : ''}
                              onClick={() => {
                                bumpIdle();
                                filter.onChange(option);
                                setOpenFilter(null);
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {keyboardOpen && (
                <div className="totem__search-dock">
                  <div className="totem__search-query" aria-live="polite">
                    <span>Buscando</span>
                    <strong>{search || '…'}</strong>
                    {search && (
                      <button
                        type="button"
                        className="totem__search-clear"
                        onClick={() => {
                          bumpIdle();
                          setSearch('');
                        }}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <TotemKeyboard
                    onKey={appendSearch}
                    onBackspace={backspaceSearch}
                    onSpace={() => appendSearch(' ')}
                    onClear={() => {
                      bumpIdle();
                      setSearch('');
                    }}
                    onClose={() => setKeyboardOpen(false)}
                  />
                </div>
              )}
            </div>

            <div className="totem__scroll" ref={listRef}>
              {products.map((product) => {
                const config = getConfig(product);
                return (
                  <article
                    key={product.id}
                    className="totem-card"
                    onPointerDown={bumpIdle}
                  >
                    <div className="totem-card__media">
                      <ProductCarousel
                        images={product.images}
                        alt={product.name}
                        size="card"
                        className={`brand-${product.brand}`}
                      />
                    </div>

                    <div className="totem-card__body">
                      <h2>{product.name}</h2>

                      <div className="totem-card__fields">
                        <TotemPicker
                          label="Cor"
                          value={config.color}
                          options={product.colors}
                          onChange={(value) => {
                            bumpIdle();
                            patchConfig(product.id, { color: value });
                          }}
                        />
                        <TotemPicker
                          label="Capacidade"
                          value={config.storage}
                          options={product.storages}
                          onChange={(value) => {
                            bumpIdle();
                            patchConfig(product.id, { storage: value });
                          }}
                        />
                        <TotemPicker
                          label="Retirada"
                          value={config.fulfillment}
                          options={FULFILLMENT_OPTIONS}
                          onChange={(value) => {
                            bumpIdle();
                            patchConfig(product.id, { fulfillment: value });
                          }}
                        />
                      </div>

                      <div className="totem-card__footer">
                        <div className="totem-card__price">
                          <span>À Vista</span>
                          <strong>{formatBRL(product.cashPrice)}</strong>
                          <small>{product.installmentLabel}</small>
                        </div>
                        <button
                          type="button"
                          className="totem-btn totem-btn--primary"
                          onClick={() => openCheckout(product)}
                        >
                          Próximo
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {products.length === 0 && (
                <p className="totem__empty">Nenhum produto encontrado com esses filtros.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 'checkout' && selection && (
        <section className="totem__checkout">
          <button
            type="button"
            className="totem-link"
            onClick={() => setStep('catalog')}
            disabled={submitting}
          >
            ← Voltar ao catálogo
          </button>

          <div className="totem__checkout-card">
            <ProductCarousel
              images={selection.product.images}
              alt={selection.product.name}
              size="hero"
              autoPlayMs={5000}
              className={`brand-${selection.product.brand}`}
            />

            <div className="totem__checkout-form">
              <h1>{selection.product.name}</h1>
              <div className="totem__summary">
                <p>
                  <span>Cor</span>
                  <strong>{selection.color}</strong>
                </p>
                <p>
                  <span>Capacidade</span>
                  <strong>{selection.storage}</strong>
                </p>
                <p>
                  <span>Retirada</span>
                  <strong>{selection.fulfillment}</strong>
                </p>
              </div>

              {error && (
                <p className="totem__error" role="alert">
                  {error}
                </p>
              )}

              <label className="totem-field">
                Digite seu nome e sobrenome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  disabled={submitting}
                />
              </label>

              <label className="totem-field">
                Digite seu telefone com DDD
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(24) 99999-9999"
                  inputMode="tel"
                  disabled={submitting}
                />
              </label>

              <TotemPicker
                label="Modo de pagamento"
                value={selection.payment}
                options={PAYMENT_OPTIONS}
                disabled={submitting}
                onChange={(value) => setSelection({ ...selection, payment: value })}
              />

              {selection.payment === 'Parcelado' && (
                <TotemPicker
                  label="Parcelas"
                  value={selection.installment}
                  options={INSTALLMENTS}
                  disabled={submitting}
                  onChange={(value) => setSelection({ ...selection, installment: value })}
                />
              )}

              <div className="totem__prices">
                <div>
                  <span>Valor definido</span>
                  <strong>
                    {selection.payment === 'À vista'
                      ? formatBRL(selection.product.cashPrice)
                      : `${selection.installment} · ${selection.product.installmentLabel}`}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="totem-btn totem-btn--primary totem-btn--block"
                disabled={submitting || !name.trim() || phone.trim().length < 8}
                onClick={() => void handleWhatsAppSubmit()}
              >
                {submitting ? 'Enviando…' : 'Continuar no WhatsApp…'}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'done' && selection && (
        <section className="totem__done">
          <h1>Pedido enviado</h1>
          <p>
            Obrigado, <strong>{name}</strong>! A loja recebeu seu interesse no{' '}
            <strong>{selection.product.name}</strong> ({selection.color} · {selection.storage}) via
            WhatsApp.
          </p>
          <p className="totem__done-note">Em breve alguém da equipe entrará em contato.</p>
          <button type="button" className="totem-btn totem-btn--primary" onClick={resetTotem}>
            Novo atendimento
          </button>
        </section>
      )}

      <footer className="totem__hint">
        Escolha o modelo que mais te agrade e nos envie um WhatsApp. Clique em Próximo e digite seus
        dados.
      </footer>

      {exitOpen && (
        <div className="totem-lock" role="dialog" aria-modal="true" aria-labelledby="totem-exit-title">
          <form className="totem-lock__card" onSubmit={confirmExit}>
            <h2 id="totem-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para fechar o totem. Clientes não devem sair desta tela.</p>
            {exitError && (
              <p className="totem__error" role="alert">
                {exitError}
              </p>
            )}
            <label className="totem-field">
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => {
                  setExitPassword(e.target.value);
                  setExitError(null);
                }}
                autoFocus
                autoComplete="current-password"
                placeholder="Senha da loja"
              />
            </label>
            <div className="totem-lock__actions">
              <button
                type="button"
                className="totem-btn totem-btn--ghost"
                onClick={() => setExitOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="totem-btn totem-btn--primary">
                Confirmar saída
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
