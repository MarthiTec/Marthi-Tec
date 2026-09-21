import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import {
  formatPicked,
  productAttrValues,
  resolveTotemAttrOptions,
  toLegacyFields,
  totemCardAttributes,
  totemFilterAttributes,
  type PickedAttribute,
  type ProductAttribute,
} from '../../data/attributeStore';
import { subscribeTotemLive } from '../../data/totemLiveSync';
import { speakTotem, stopTotemSpeech } from '../../data/totemSpeech';
import {
  getTotemExitPassword,
  getTotemSettings,
  storeGreeting,
  totemCopy,
  TOTEM_DINE_ID,
  TOTEM_DINE_OPTIONS,
  type TotemColumns,
  type TotemKeyboardPlacement,
  type TotemMode,
  type TotemSettings,
  type TotemVertical,
} from '../../data/totemSettings';
import { printWaitTicket, ticketSenha } from '../../data/totemTicketPrint';
import { trackTotemProductClick } from '../../data/totemAnalyticsStore';
import { formatInstallment, quoteFromPicked, quoteTotemVariant } from '../../data/variantQuote';
import { submitTotemLead } from '../../services/totem';
import { ProductCarousel } from './ProductCarousel';
import { TotemAttractScene } from './TotemAttractScene';
import { TotemKeyboard } from './TotemKeyboard';
import { TotemPicker } from './TotemPicker';
import {
  INSTALLMENTS,
  PAYMENT_OPTIONS,
  TOTEM_BRANDS,
  formatBRL,
  type TotemBrand,
  type TotemProduct,
} from './totemData';
import { listTotemCatalog, loadTotemCatalog } from './totemCatalog';
import './totem.css';

const FILTER_IDLE_MS = 2 * 60 * 1000;

type Step = 'attract' | 'welcome' | 'catalog' | 'checkout' | 'done';
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

function customerFirstName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

function customerWelcomeLine(fullName: string, hello: string, shop: string) {
  const first = customerFirstName(fullName);
  if (!first) return `${hello}. ${shop} te dá as boas-vindas.`;
  const options = [
    `${hello}, ${first}! ${shop} te dá as boas-vindas.`,
    `Que bom te ver, ${first}. ${hello}.`,
    `${first}, fique à vontade. ${shop} preparou a vitrine para você.`,
    `Olá, ${first}. Estamos felizes com a sua visita.`,
  ];
  return options[first.charCodeAt(0) % options.length];
}

function startStep(settings: TotemSettings): Step {
  if (settings.showAttractScreen) return 'attract';
  return settings.mode !== 'catalog' && settings.askCustomerName ? 'welcome' : 'catalog';
}

function catalogFingerprint(items: { id: number; name: string; cashPrice: number; totalQty?: number }[]) {
  return items.map((item) => `${item.id}:${item.name}:${item.cashPrice}:${item.totalQty ?? ''}`).join('|');
}

function defaultConfig(product: TotemProduct, attrs: ProductAttribute[]): CardConfig {
  const next: CardConfig = {};
  for (const attr of attrs) {
    const values = resolveTotemAttrOptions(product, attr);
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
      const values = resolveTotemAttrOptions(product, attr);
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
  const [step, setStep] = useState<Step>(() => startStep(getTotemSettings()));
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
  const [cardAttrs, setCardAttrs] = useState(() => totemCardAttributes());
  const [filterAttrs, setFilterAttrs] = useState(() => totemFilterAttributes());

  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);
  const [mode, setMode] = useState<TotemMode>(() => getTotemSettings().mode);
  const [vertical, setVertical] = useState<TotemVertical>(() => getTotemSettings().vertical);
  const [columns, setColumns] = useState<TotemColumns>(() => getTotemSettings().columns);
  const [askCustomerName, setAskCustomerName] = useState(() => getTotemSettings().askCustomerName);
  const [offerFulfillment, setOfferFulfillment] = useState(() => getTotemSettings().offerFulfillment);
  const [printTicket, setPrintTicket] = useState(() => getTotemSettings().printTicket);
  const [audioAssist, setAudioAssist] = useState(() => getTotemSettings().audioAssist);
  const [showAttractScreen, setShowAttractScreen] = useState(() => getTotemSettings().showAttractScreen);
  const [storeName, setStoreName] = useState(() => getTotemSettings().storeName);
  const [storeLogo, setStoreLogo] = useState(() => getTotemSettings().storeLogo);
  const [attractBackground, setAttractBackground] = useState(() => getTotemSettings().attractBackground);
  const [attractGradientColor, setAttractGradientColor] = useState(
    () => getTotemSettings().attractGradientColor,
  );
  const [keyboardPlacement, setKeyboardPlacement] = useState<TotemKeyboardPlacement>(
    () => getTotemSettings().keyboardPlacement,
  );
  const [sessionMode, setSessionMode] = useState<TotemMode | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => getTotemSettings().audioAssist);
  const [requiredExitPassword, setRequiredExitPassword] = useState(() => getTotemExitPassword());
  const [catalog, setCatalog] = useState(() => listTotemCatalog());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const effectiveMode = sessionMode ?? mode;
  const catalogOnly = effectiveMode === 'catalog';
  const showDineIn = offerFulfillment && !catalogOnly;
  const collectNameUpFront = askCustomerName && !catalogOnly;
  const canPrintTicket = printTicket && !catalogOnly;
  const copy = totemCopy(vertical);
  const senha = ticketId ? ticketSenha(ticketId) : '';
  const greeting = storeGreeting();

  const hasActiveQuery =
    search.trim() !== '' ||
    brand !== 'all' ||
    Object.values(filters).some((value) => value && value !== 'all');

  const homeStep: Step = showAttractScreen
    ? 'attract'
    : collectNameUpFront
      ? 'welcome'
      : 'catalog';

  const awayFromHome =
    step !== homeStep ||
    hasActiveQuery ||
    Boolean(selection) ||
    (step === 'welcome' && name.trim() !== '') ||
    (step !== 'welcome' && name.trim() !== '') ||
    phone.trim() !== '' ||
    exitOpen;

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

  function resetToHome() {
    clearCatalogFilters();
    setStep(homeStep);
    setSelection(null);
    setName('');
    setPhone('');
    setError(null);
    setSubmitting(false);
    setExitOpen(false);
    setExitPassword('');
    setExitError(null);
    setConfigs({});
    setTicketId(null);
    setSessionMode(null);
    stopTotemSpeech();
    window.scrollTo({ top: 0 });
    listRef.current?.scrollTo({ top: 0 });
  }

  function printCurrentTicket(
    id: string,
    productName: string,
    picked: PickedAttribute[],
    priceLabel: string,
  ) {
    return printWaitTicket({
      storeName: storeName.trim() || 'Sua Loja',
      ticketId: id,
      senha: ticketSenha(id),
      customerName: name.trim() || 'Cliente',
      productName,
      picked,
      priceLabel,
    });
  }

  const brandProducts = useMemo(() => {
    return catalog.filter((item) => brand === 'all' || item.brand === brand);
  }, [brand, catalog]);

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
    if (!awayFromHome) return;
    const timer = window.setTimeout(() => {
      resetToHome();
    }, FILTER_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [awayFromHome, idleTick, step, hasActiveQuery, selection, name, phone, exitOpen, search, brand, filters]);

  useEffect(() => {
    function onActivity() {
      bumpIdle();
    }
    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', onActivity, options);
    window.addEventListener('keydown', onActivity, options);
    window.addEventListener('touchstart', onActivity, options);
    window.addEventListener('scroll', onActivity, options);
    return () => {
      window.removeEventListener('pointerdown', onActivity, options);
      window.removeEventListener('keydown', onActivity, options);
      window.removeEventListener('touchstart', onActivity, options);
      window.removeEventListener('scroll', onActivity, options);
    };
  }, []);

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
    return () => stopTotemSpeech();
  }, []);

  useEffect(() => {
    if (!voiceOn) {
      stopTotemSpeech();
      return;
    }
    if (step === 'attract' && showAttractScreen) {
      speakTotem(`${greeting}. Bem-vindo à ${storeName}. Inicie um pedido ou veja o catálogo.`, true);
      return;
    }
    if (step === 'welcome' && collectNameUpFront) {
      speakTotem(`${copy.welcomeTitle}. ${copy.welcomeText}`, true);
      return;
    }
    if (step === 'catalog') {
      const first = customerFirstName(name);
      if (collectNameUpFront && first) {
        speakTotem(`${customerWelcomeLine(name, greeting, storeName)} Escolha o que você quer.`, true);
        return;
      }
      speakTotem(catalogOnly ? copy.footerCatalog : copy.footerKiosk, true);
      return;
    }
    if (step === 'checkout' && selection) {
      const first = customerFirstName(name);
      speakTotem(
        first
          ? `${first}, confira ${selection.product.name} e confirme o pedido.`
          : `Confira ${selection.product.name} e confirme o pedido.`,
        true,
      );
      return;
    }
    if (step === 'done') {
      const first = customerFirstName(name);
      speakTotem(
        senha
          ? `${first ? `Obrigado, ${first}. ` : ''}${copy.doneTitle}. Senha ${senha.split('').join(' ')}. ${copy.doneHint}`
          : `${first ? `Obrigado, ${first}. ` : ''}${copy.doneTitle}. ${copy.doneHint}`,
        true,
      );
    }
  }, [step, voiceOn]);

  useEffect(() => {
    let active = true;
    async function hydrateCatalog() {
      setCatalogLoading(true);
      const next = await loadTotemCatalog();
      if (active) {
        setCatalog(next);
        setCatalogLoading(false);
      }
    }
    void hydrateCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function applyCatalog(next: ReturnType<typeof listTotemCatalog>) {
      setCatalog((current) =>
        catalogFingerprint(current) === catalogFingerprint(next) ? current : next,
      );
    }

    function refreshLive() {
      const settings = getTotemSettings();
      setMode(settings.mode);
      setVertical(settings.vertical);
      setColumns(settings.columns);
      setAskCustomerName(settings.askCustomerName);
      setOfferFulfillment(settings.offerFulfillment);
      setPrintTicket(settings.printTicket);
      setAudioAssist(settings.audioAssist);
      setShowAttractScreen(settings.showAttractScreen);
      setStoreName(settings.storeName);
      setStoreLogo(settings.storeLogo);
      setAttractBackground(settings.attractBackground);
      setAttractGradientColor(settings.attractGradientColor);
      setKeyboardPlacement(settings.keyboardPlacement);
      setRequiredExitPassword(settings.exitPassword);
      setCardAttrs(totemCardAttributes());
      setFilterAttrs(totemFilterAttributes());
      applyCatalog(listTotemCatalog());
      void loadTotemCatalog().then(applyCatalog);
    }

    refreshLive();
    return subscribeTotemLive(refreshLive);
  }, []);

  useEffect(() => {
    if (!collectNameUpFront && step === 'welcome') setStep('catalog');
    if (!showAttractScreen && step === 'attract') {
      setStep(collectNameUpFront ? 'welcome' : 'catalog');
    }
  }, [collectNameUpFront, showAttractScreen, step]);

  function beginOrder() {
    bumpIdle();
    setSessionMode('kiosk');
    setStep(askCustomerName ? 'welcome' : 'catalog');
  }

  function beginCatalogBrowse() {
    bumpIdle();
    setSessionMode('catalog');
    setStep('catalog');
  }

  function getConfig(product: TotemProduct): CardConfig {
    const base = { ...defaultConfig(product, cardAttrs), ...(configs[product.id] ?? {}) };
    if (showDineIn && !base[TOTEM_DINE_ID]) base[TOTEM_DINE_ID] = TOTEM_DINE_OPTIONS[0];
    for (const attr of filterAttrs) {
      const selected = filters[attr.id];
      const values = resolveTotemAttrOptions(product, attr);
      if (selected && selected !== 'all' && values.includes(selected)) {
        base[attr.id] = selected;
      }
    }
    return base;
  }

  function patchConfig(productId: number, attrId: string, value: string) {
    setConfigs((current) => {
      const product = catalog.find((item) => item.id === productId);
      const base = current[productId] ?? (product ? defaultConfig(product, cardAttrs) : {});
      return { ...current, [productId]: { ...base, [attrId]: value } };
    });
  }

  function openCheckout(product: TotemProduct) {
    trackTotemProductClick({ productId: product.id, productName: product.name });
    if (catalogOnly) return;
    const config = getConfig(product);
    const picked = pickedFromConfig(product, config, cardAttrs);
    if (showDineIn) {
      picked.push({
        id: TOTEM_DINE_ID,
        name: 'Pedido',
        value: config[TOTEM_DINE_ID] || TOTEM_DINE_OPTIONS[0],
      });
    }
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
    resetToHome();
  }

  function goTotemBack() {
    bumpIdle();
    if (step === 'done') {
      resetToHome();
      return;
    }
    if (step === 'checkout') {
      setSelection(null);
      setStep('catalog');
      return;
    }
    if (step === 'catalog') {
      if (collectNameUpFront && sessionMode !== 'catalog') {
        setStep('welcome');
        return;
      }
      if (showAttractScreen) {
        setSessionMode(null);
        setStep('attract');
      }
      return;
    }
    if (step === 'welcome' && showAttractScreen) {
      setSessionMode(null);
      setStep('attract');
    }
  }

  const showTotemBack =
    step === 'checkout' ||
    step === 'done' ||
    (step === 'welcome' && showAttractScreen) ||
    (step === 'catalog' && (collectNameUpFront || showAttractScreen));

  const namedHello = collectNameUpFront ? customerFirstName(name) : '';
  const namedWelcome = namedHello ? customerWelcomeLine(name, greeting, storeName) : '';

  function requestExit() {
    setExitPassword('');
    setExitError(null);
    setExitOpen(true);
  }

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== requiredExitPassword) {
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
      !copy.showInstallments || selection.payment === 'À vista'
        ? formatBRL(selection.cashPrice)
        : `${selection.installment} · ${formatInstallment(
            selection.cashPrice,
            Number.parseInt(selection.installment, 10) || 12,
          )}`;
    const legacy = toLegacyFields(selection.picked);

    try {
      const result = await submitTotemLead({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        productName: selection.product.name,
        attributes: selection.picked,
        ...legacy,
        payment: copy.showInstallments ? selection.payment : 'À vista',
        installment:
          copy.showInstallments && selection.payment === 'Parcelado' ? selection.installment : null,
        priceLabel,
      });
      setTicketId(result.ticketId);
      setStep('done');
      if (canPrintTicket) {
        printCurrentTicket(result.ticketId, selection.product.name, selection.picked, priceLabel);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a proposta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`totem ${step === 'catalog' ? 'totem--page-scroll' : ''} ${step === 'attract' ? 'totem--attract' : ''}`}
      data-cols={columns}
      data-kb={keyboardPlacement}
      data-vertical={vertical}
      style={{ ['--totem-cols' as string]: String(columns) }}
    >
      <header className={`totem__top ${step === 'attract' ? 'totem__top--ghost' : ''}`}>
        {storeLogo ? (
          <img src={storeLogo} alt={storeName} className="totem__mark" />
        ) : (
          <BrandLogo variant="mark" className="totem__mark" />
        )}
        {namedHello ? (
          <div className="totem__top-meta">
            <strong>{storeName}</strong>
            <span>
              {greeting}, {namedHello}
            </span>
          </div>
        ) : (
          <div className="totem__top-meta">
            <strong>{storeName}</strong>
            <span>{catalogOnly ? copy.catalogSubtitle : copy.kioskSubtitle}</span>
          </div>
        )}
        {showTotemBack ? (
          <button type="button" className="totem__back" onClick={goTotemBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 8 12l7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Voltar
          </button>
        ) : null}
        {audioAssist ? (
          <button
            type="button"
            className={`totem__audio ${voiceOn ? 'is-on' : ''}`}
            aria-pressed={voiceOn}
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (next) speakTotem('Áudio ligado.', true);
              else stopTotemSpeech();
            }}
          >
            {voiceOn ? 'Ouvir' : 'Mudo'}
          </button>
        ) : null}
        <button type="button" className="totem__exit" onClick={requestExit}>
          Sair
        </button>
      </header>
      <p className="totem-sr-only" aria-live="polite">
        {step === 'done' && senha ? `Senha ${senha}` : `${greeting}. ${storeName}`}
      </p>

      {step === 'attract' && showAttractScreen && (
        <TotemAttractScene
          storeName={storeName}
          storeLogo={storeLogo}
          greeting={greeting}
          gradientColor={attractGradientColor}
          backgroundImage={attractBackground}
          onStartOrder={beginOrder}
          onBrowseCatalog={beginCatalogBrowse}
        />
      )}

      {step === 'welcome' && collectNameUpFront && (
        <section className={`totem__welcome totem__welcome--kb-${keyboardPlacement}`}>
          {keyboardPlacement === 'top' ? (
            <>
              <TotemKeyboard
                onKey={(char) => {
                  bumpIdle();
                  setName((current) => `${current}${char}`.slice(0, 40));
                }}
                onBackspace={() => {
                  bumpIdle();
                  setName((current) => current.slice(0, -1));
                }}
                onSpace={() => {
                  bumpIdle();
                  setName((current) => `${current} `.slice(0, 40));
                }}
                onClear={() => {
                  bumpIdle();
                  setName('');
                }}
                onClose={() => {
                  if (name.trim()) {
                    bumpIdle();
                    setStep('catalog');
                  }
                }}
              />
              <div className="totem__welcome-copy">
                <h1>{copy.welcomeTitle}</h1>
                <p>{copy.welcomeText}</p>
                <label className="totem-field">
                  Nome
                  <input
                    value={name}
                    onChange={(e) => {
                      bumpIdle();
                      setName(e.target.value);
                    }}
                    placeholder="Seu nome"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="totem-btn totem-btn--primary totem-btn--block"
                  disabled={!name.trim()}
                  onClick={() => {
                    bumpIdle();
                    setStep('catalog');
                  }}
                >
                  Ver produtos
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="totem__welcome-copy">
                <h1>{copy.welcomeTitle}</h1>
                <p>{copy.welcomeText}</p>
                <label className="totem-field">
                  Nome
                  <input
                    value={name}
                    onChange={(e) => {
                      bumpIdle();
                      setName(e.target.value);
                    }}
                    placeholder="Seu nome"
                    autoComplete="off"
                  />
                </label>
              </div>
              <TotemKeyboard
                onKey={(char) => {
                  bumpIdle();
                  setName((current) => `${current}${char}`.slice(0, 40));
                }}
                onBackspace={() => {
                  bumpIdle();
                  setName((current) => current.slice(0, -1));
                }}
                onSpace={() => {
                  bumpIdle();
                  setName((current) => `${current} `.slice(0, 40));
                }}
                onClear={() => {
                  bumpIdle();
                  setName('');
                }}
                onClose={() => {
                  if (name.trim()) {
                    bumpIdle();
                    setStep('catalog');
                  }
                }}
              />
              <button
                type="button"
                className="totem-btn totem-btn--primary totem-btn--block"
                disabled={!name.trim()}
                onClick={() => {
                  bumpIdle();
                  setStep('catalog');
                }}
              >
                Ver produtos
              </button>
            </>
          )}
        </section>
      )}

      {step === 'catalog' && (
        <section className="totem__floor totem__floor--topnav">
          <div className="totem__stage" ref={searchPanelRef}>
            <div className="totem__search-panel">
              {copy.showBrandFilters ? (
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
              ) : null}

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
                  {search || copy.searchPlaceholder}
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

              {keyboardOpen && keyboardPlacement === 'top' ? (
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
              ) : null}
            </div>

            <div
              className="totem__scroll"
              ref={listRef}
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {products.map((product) => {
                const config = getConfig(product);
                const pickers = cardAttrs
                  .filter((attr) => resolveTotemAttrOptions(product, attr).length > 0)
                  .slice(0, 5);
                const quote = quoteTotemVariant(product.name, product.cashPrice, config);
                return (
                  <article
                    key={product.id}
                    className="totem-card"
                    onPointerDown={bumpIdle}
                  >
                    <div
                      className="totem-card__media"
                      onClick={() => {
                        if (catalogOnly) {
                          trackTotemProductClick({
                            productId: product.id,
                            productName: product.name,
                          });
                        }
                      }}
                    >
                      <ProductCarousel
                        images={product.images}
                        alt={product.name}
                        size="card"
                        className={`brand-${product.brand}`}
                      />
                    </div>

                    <div className="totem-card__body">
                      <h2>{product.name}</h2>

                      <div className="totem-card__fields" data-count={pickers.length + (showDineIn ? 1 : 0)}>
                        {pickers.map((attr) => {
                          const options = resolveTotemAttrOptions(product, attr);
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
                        {showDineIn ? (
                          <TotemPicker
                            label="Pedido"
                            value={config[TOTEM_DINE_ID] || TOTEM_DINE_OPTIONS[0]}
                            options={TOTEM_DINE_OPTIONS}
                            onChange={(value) => {
                              bumpIdle();
                              patchConfig(product.id, TOTEM_DINE_ID, value);
                            }}
                          />
                        ) : null}
                      </div>

                      <div className="totem-card__footer">
                        <div className="totem-card__price">
                          {copy.showInstallments ? <span>À Vista</span> : <span>Preço</span>}
                          <strong>{formatBRL(quote.cashPrice)}</strong>
                          {copy.showInstallments ? <small>{quote.installmentLabel}</small> : null}
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
                            {copy.nextButton}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {catalogLoading && products.length === 0 && (
                <p className="totem__empty">Carregando catálogo…</p>
              )}
              {!catalogLoading && products.length === 0 && (
                <p className="totem__empty">Nenhum produto encontrado com esses filtros.</p>
              )}
            </div>
            {keyboardOpen && keyboardPlacement === 'bottom' ? (
              <div className="totem__search-dock totem__search-dock--floor">
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
            ) : null}
          </div>
        </section>
      )}

      {step === 'checkout' && selection && (
        <section className="totem__checkout">
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

              {collectNameUpFront ? (
                <p className="totem__summary-name">
                  Ticket para <strong>{name.trim()}</strong>
                </p>
              ) : (
                <label className="totem-field">
                  Digite seu nome e sobrenome
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    disabled={submitting}
                  />
                </label>
              )}

              {!collectNameUpFront && !canPrintTicket ? (
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
              ) : null}

              {copy.showInstallments ? (
                <TotemPicker
                  label="Modo de pagamento"
                  value={selection.payment}
                  options={PAYMENT_OPTIONS}
                  disabled={submitting}
                  onChange={(value) => setSelection({ ...selection, payment: value })}
                />
              ) : null}

              {copy.showInstallments && selection.payment === 'Parcelado' && (
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
                    {copy.showInstallments && selection.payment === 'Parcelado'
                      ? `${selection.installment} · ${formatInstallment(
                          selection.cashPrice,
                          Number.parseInt(selection.installment, 10) || 12,
                        )}`
                      : formatBRL(selection.cashPrice)}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="totem-btn totem-btn--primary totem-btn--block"
                disabled={
                  submitting ||
                  (collectNameUpFront && !name.trim()) ||
                  (!collectNameUpFront && !canPrintTicket && (!name.trim() || phone.trim().length < 8))
                }
                onClick={() => void handleWhatsAppSubmit()}
              >
                {submitting ? copy.sendingButton : copy.confirmButton}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'done' && selection && (
        <section className="totem__done">
          <h1>{copy.doneTitle}</h1>
          {senha ? (
            <div className="totem__senha" aria-label={`Senha ${senha}`}>
              {senha}
            </div>
          ) : null}
          <p>
            {name.trim() ? `Obrigado, ${name.trim()}!` : 'Obrigado!'} {copy.doneHint}
          </p>
          <p>
            <strong>{selection.product.name}</strong>
            {formatPicked(selection.picked) ? ` (${formatPicked(selection.picked)})` : ''}.
          </p>
          <p className="totem__done-note">O pedido já está na fila do PDV para atendimento.</p>
          {canPrintTicket ? (
            <button
              type="button"
              className="totem-btn totem-btn--ghost"
              onClick={() =>
                printCurrentTicket(
                  ticketId || 'PDV-0',
                  selection.product.name,
                  selection.picked,
                  formatBRL(selection.cashPrice),
                )
              }
            >
              Imprimir ticket
            </button>
          ) : null}
          <button type="button" className="totem-btn totem-btn--primary" onClick={resetTotem}>
            Novo atendimento
          </button>
        </section>
      )}

      {step !== 'attract' ? (
      <footer className="totem__hint">
        {catalogOnly ? copy.footerCatalog : collectNameUpFront ? copy.footerNamed : copy.footerKiosk}
      </footer>
      ) : null}

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
