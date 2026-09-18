import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import {
  ATTRIBUTES_EVENT,
  formatPicked,
  productAttrValues,
  toLegacyFields,
  totemAttributes,
  totemFilterAttributes,
  type PickedAttribute,
  type ProductAttribute,
} from '../../data/attributeStore';
import { getTotemSettings, TOTEM_SETTINGS_EVENT, type TotemMode } from '../../data/totemSettings';
import { formatInstallment, quoteFromPicked, quoteTotemVariant } from '../../data/variantQuote';
import { submitTotemLead } from '../../services/totem';
import { ProductCarousel } from './ProductCarousel';
import { TotemKeyboard } from './TotemKeyboard';
import { TotemPicker } from './TotemPicker';
import {
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
type CardConfig = Record<string, string>;

type Selection = {
  product: TotemProduct;
  picked: PickedAttribute[];
  payment: string;
  installment: string;
  cashPrice: number;
  installmentLabel: string;
};

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function defaultConfig(product: TotemProduct, attrs: ProductAttribute[]): CardConfig {
  const next: CardConfig = {};
  for (const attr of attrs) {
    const values = productAttrValues(product, attr);
    if (values[0]) next[attr.id] = values[0];
  }
  return next;
}

function pickedFromConfig(
  product: TotemProduct,
  config: CardConfig,
  attrs: ProductAttribute[],
): PickedAttribute[] {
  return attrs
    .map((attr) => {
      const values = productAttrValues(product, attr);
      if (!values.length) return null;
      return {
        id: attr.id,
        name: attr.name,
        value: values.includes(config[attr.id]) ? config[attr.id] : values[0],
      };
    })
    .filter((item): item is PickedAttribute => Boolean(item));
}

export function TotemPage() {
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('catalog');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [search, setSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<number, CardConfig>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleTick, setIdleTick] = useState(0);
  const [attrs, setAttrs] = useState(() => totemAttributes());
  const [filterAttrs, setFilterAttrs] = useState(() => totemFilterAttributes());

  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);
  const [mode, setMode] = useState<TotemMode>(() => getTotemSettings().mode);
  const catalogOnly = mode === 'catalog';

  const hasActiveQuery =
    search.trim() !== '' ||
    brand !== 'all' ||
    Object.values(filters).some((value) => value && value !== 'all');

  function bumpIdle() {
    setIdleTick((current) => current + 1);
  }

  function clearCatalogFilters() {
    setSearch('');
    setBrand('all');
    setFilters({});
    setOpenFilter(null);
    setKeyboardOpen(false);
  }

  const brandProducts = useMemo(() => {
    return TOTEM_PRODUCTS.filter((item) => brand === 'all' || item.brand === brand);
  }, [brand]);

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    return brandProducts.filter((item) => {
      const searchOk = query === '' || item.name.toLowerCase().includes(query);
      const attrOk = filterAttrs.every((attr) => {
        const selected = filters[attr.id] ?? 'all';
        if (selected === 'all') return true;
        return productAttrValues(item, attr).includes(selected);
      });
      return searchOk && attrOk;
    });
  }, [brandProducts, search, filters, filterAttrs]);

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
  }, [step, brand, search, filters]);

  useEffect(() => {
    setFilters({});
  }, [brand]);

  useEffect(() => {
    if (step !== 'catalog' || !hasActiveQuery) return;
    const timer = window.setTimeout(() => {
      clearCatalogFilters();
    }, FILTER_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [step, hasActiveQuery, idleTick, search, brand, filters]);

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

  useEffect(() => {
    function refreshMode() {
      const next = getTotemSettings().mode;
      setMode(next);
      if (next === 'catalog') {
        setStep('catalog');
        setSelection(null);
      }
    }
    function refreshAttrs() {
      setAttrs(totemAttributes());
      setFilterAttrs(totemFilterAttributes());
    }
    refreshAttrs();
    window.addEventListener(TOTEM_SETTINGS_EVENT, refreshMode);
    window.addEventListener(ATTRIBUTES_EVENT, refreshAttrs);
    return () => {
      window.removeEventListener(TOTEM_SETTINGS_EVENT, refreshMode);
      window.removeEventListener(ATTRIBUTES_EVENT, refreshAttrs);
    };
  }, []);

  function getConfig(product: TotemProduct): CardConfig {
    const base = { ...defaultConfig(product, attrs), ...(configs[product.id] ?? {}) };
    for (const attr of filterAttrs) {
      const selected = filters[attr.id];
      const values = productAttrValues(product, attr);
      if (selected && selected !== 'all' && values.includes(selected)) {
        base[attr.id] = selected;
      }
    }
    return base;
  }

  function patchConfig(productId: number, attrId: string, value: string) {
    setConfigs((current) => {
      const product = TOTEM_PRODUCTS.find((item) => item.id === productId);
      const base = current[productId] ?? (product ? defaultConfig(product, attrs) : {});
      return { ...current, [productId]: { ...base, [attrId]: value } };
    });
  }

  function openCheckout(product: TotemProduct) {
    if (catalogOnly) return;
    const config = getConfig(product);
    const picked = pickedFromConfig(product, config, attrs);
    const quote = quoteFromPicked(product.name, product.cashPrice, picked);
    setSelection({
      product,
      picked,
      payment: PAYMENT_OPTIONS[0],
      installment: INSTALLMENTS[0],
      cashPrice: quote.cashPrice,
      installmentLabel: quote.installmentLabel,
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
        ? formatBRL(selection.cashPrice)
        : `${selection.installment} · ${formatInstallment(
            selection.cashPrice,
            Number.parseInt(selection.installment, 10) || 12,
          )}`;
    const legacy = toLegacyFields(selection.picked);

    try {
      await submitTotemLead({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        productName: selection.product.name,
        attributes: selection.picked,
        ...legacy,
        payment: selection.payment,
        installment: selection.payment === 'Parcelado' ? selection.installment : null,
        priceLabel,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a proposta.');
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
          <span>{catalogOnly ? 'Catálogo da loja' : 'Quiosque de venda · Shopping'}</span>
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
              </div>

              <div className="totem__querybar">
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

                {filterAttrs.map((attr) => {
                  const value = filters[attr.id] ?? 'all';
                  const options = uniqueSorted([
                    ...attr.values,
                    ...brandProducts.flatMap((item) => productAttrValues(item, attr)),
                  ]);
                  if (!options.length) return null;
                  return (
                    <div key={attr.id} className="totem-filter">
                      <button
                        type="button"
                        className={`totem-filter__label ${value !== 'all' ? 'is-set' : ''} ${openFilter === attr.id ? 'is-open' : ''}`}
                        onClick={() => {
                          bumpIdle();
                          setKeyboardOpen(false);
                          setOpenFilter((current) => (current === attr.id ? null : attr.id));
                        }}
                      >
                        <span>{attr.name}</span>
                        <strong>{value !== 'all' ? value : 'Todas'}</strong>
                      </button>
                      {openFilter === attr.id && (
                        <div className="totem-filter__menu" role="listbox" aria-label={attr.name}>
                          <button
                            type="button"
                            className={value === 'all' ? 'is-active' : ''}
                            onClick={() => {
                              bumpIdle();
                              setFilters((current) => ({ ...current, [attr.id]: 'all' }));
                              setOpenFilter(null);
                            }}
                          >
                            Todas
                          </button>
                          {options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={value === option ? 'is-active' : ''}
                              onClick={() => {
                                bumpIdle();
                                setFilters((current) => ({ ...current, [attr.id]: option }));
                                setOpenFilter(null);
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                const pickers = attrs
                  .filter((attr) => productAttrValues(product, attr).length > 0)
                  .slice(0, 5);
                const quote = quoteTotemVariant(product.name, product.cashPrice, config);
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

                      <div className="totem-card__fields" data-count={pickers.length}>
                        {pickers.map((attr) => {
                          const options = productAttrValues(product, attr);
                          return (
                            <TotemPicker
                              key={attr.id}
                              label={attr.name}
                              value={
                                options.includes(config[attr.id]) ? config[attr.id] : options[0]
                              }
                              options={options}
                              onChange={(value) => {
                                bumpIdle();
                                patchConfig(product.id, attr.id, value);
                              }}
                            />
                          );
                        })}
                      </div>

                      <div className="totem-card__footer">
                        <div className="totem-card__price">
                          <span>À Vista</span>
                          <strong>{formatBRL(quote.cashPrice)}</strong>
                          <small>{quote.installmentLabel}</small>
                          {quote.stock ? (
                            <em className="totem-card__stock">
                              {quote.qty > 0 ? `${quote.qty} un. em estoque` : 'Sob consulta'}
                            </em>
                          ) : null}
                        </div>
                        {catalogOnly ? null : (
                          <button
                            type="button"
                            className="totem-btn totem-btn--primary"
                            onClick={() => openCheckout(product)}
                          >
                            Próximo
                          </button>
                        )}
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
              className={`brand-${selection.product.brand}`}
            />

            <div className="totem__checkout-form">
              <h1>{selection.product.name}</h1>
              <div className="totem__summary">
                {selection.picked.map((item) => (
                  <p key={item.id}>
                    <span>{item.name}</span>
                    <strong>{item.value}</strong>
                  </p>
                ))}
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
                      ? formatBRL(selection.cashPrice)
                      : `${selection.installment} · ${formatInstallment(
                          selection.cashPrice,
                          Number.parseInt(selection.installment, 10) || 12,
                        )}`}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="totem-btn totem-btn--primary totem-btn--block"
                disabled={submitting || !name.trim() || phone.trim().length < 8}
                onClick={() => void handleWhatsAppSubmit()}
              >
                {submitting ? 'Enviando…' : 'Enviar proposta para a loja'}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'done' && selection && (
        <section className="totem__done">
          <h1>Proposta enviada</h1>
          <p>
            Obrigado, <strong>{name}</strong>! O representante da loja recebeu seu interesse no{' '}
            <strong>{selection.product.name}</strong>
            {formatPicked(selection.picked) ? ` (${formatPicked(selection.picked)})` : ''}.
          </p>
          <p className="totem__done-note">O pedido já está na fila do PDV para atendimento.</p>
          <button type="button" className="totem-btn totem-btn--primary" onClick={resetTotem}>
            Novo atendimento
          </button>
        </section>
      )}

      <footer className="totem__hint">
        {catalogOnly
          ? 'Toque nas fotos para passar o carrossel. Este totem é um catálogo da loja.'
          : 'Escolha o modelo, toque em Próximo e envie a proposta. O pedido cai na fila da loja.'}
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
