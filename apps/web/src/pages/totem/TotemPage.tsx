import {PickupFields} from '../../components/PickupFields';
import {usePickupMethods} from '../../data/pickup';
import {productPickupMethods,selectProductVariation,productAvailableForTotem} from '../../data/productPickup';
import type {DeliveryAddress} from '../../data/pickup';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BrandLogo } from '../../components/BrandLogo';
import {
  formatPicked,
  hydrateAttributesFromApi,
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
  getTotemSettings,
  hydrateTotemSettingsFromApi,
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
import { formatInstallment, totemCardFee, quoteFromPicked, quoteTotemVariant } from '../../data/variantQuote';
import { submitTotemLead } from '../../services/totem';
import { ProductCarousel } from './ProductCarousel';
import { TotemAttractScene } from './TotemAttractScene';
import {TotemGuidedFlow} from './TotemGuidedFlow';
import {assistantText} from '../../data/totemAssistant';
import {loadTotemOffers,dayOfferFor,type DayOffer} from '../../data/dayOffers';
import QRCode from 'qrcode';
import { TotemFooter } from './TotemFooter';
import { lockDeviceToTotem, unlockDeviceFromTotem } from '../../data/totemKioskLock';
import { TotemTopBanner } from './TotemTopBanner';
import { TotemSideNav, type TotemNavItem } from './TotemSideNav';
import { TotemCartBar } from './TotemCartBar';
import { TotemCartReview, type TotemCartLine } from './TotemCartReview';
import { submitTotemCart } from '../../services/totem';
import { apiGetTotemBrands } from '../../services/erpApi';
import { apiUnlockTotem } from '../../services/erpApi';
import { TotemKeyboard } from './TotemKeyboard';
import { TotemPicker } from './TotemPicker';
import {
  INSTALLMENTS,
  PAYMENT_OPTIONS,
  formatBRL,
  type TotemProduct,
} from './totemData';
import { listTotemCatalog, listTotemStock, loadTotemCatalog } from './totemCatalog';
import './totem.css';

const TRANSACTION_IDLE_MS = 5 * 60 * 1000;
const DONE_IDLE_MS = 45 * 1000;

type Step = 'attract' | 'welcome' | 'guided' | 'catalog' | 'checkout' | 'done';
type CardConfig = Record<string, string>;

type Selection = {
  stockId?:string;pickupMethodId?:string;deliveryAddress?:DeliveryAddress;pickupPrices?:Record<string,number|null>;baseCashPrice:number;pickupAllowedIds?:string[];
  product: TotemProduct;
  picked: PickedAttribute[];
  payment: string;
  installment: string;
  cashPrice: number;
  installmentLabel: string;
  cardFeePercent?: number;
  cardRateOverride?: number;
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

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskTotemPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

/** Opções de visual e navegação que a loja escolhe nas Configurações do Totem. */
function visualFrom(settings: TotemSettings) {
  return {
    theme: settings.theme,
    catalogNav: settings.catalogNav,
    navGroup: settings.navGroup,
    topBanners: settings.topBanners,
    cartEnabled: settings.cartEnabled,
    checkoutGesture: settings.checkoutGesture,
  };
}

type TotemBrandInfo = { slug: string; name: string; logo: string | null };
const normalizeKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Grupo da vitrine (marca ou categoria do estoque). Sem valor, cai em "Outros". */
function navGroupOf(product: TotemProduct, by: TotemSettings['navGroup'], brands: Map<string, TotemBrandInfo>) {
  const raw = ((by === 'category' ? product.category : product.brandName) ?? '').trim();
  if (!raw) return { key: 'outros', label: 'Outros', logo: undefined };
  if (by === 'brand') {
    const brand = brands.get(normalizeKey(raw));
    if (brand) return { key: normalizeKey(brand.slug), label: brand.name, logo: brand.logo ?? undefined };
  }
  return { key: normalizeKey(raw), label: raw, logo: undefined };
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
  const preview = new URLSearchParams(window.location.search).get("preview") === "1";
  const navigate = useNavigate();

  // Abriu o totem neste aparelho: daqui em diante só sai com a senha da loja.
  useEffect(() => {
    if (!preview) lockDeviceToTotem(`${window.location.pathname}${window.location.search}`);
  }, [preview]);
  const listRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(() => startStep(getTotemSettings()));
  const [group, setGroup] = useState('all');
  const [visual, setVisual] = useState(() => visualFrom(getTotemSettings()));
  const [cart, setCart] = useState<TotemCartLine[]>([]);
  const [doneCart, setDoneCart] = useState<TotemCartLine[]>([]);
  const [addedFlash, setAddedFlash] = useState<number | null>(null);
  const [cartPayment, setCartPayment] = useState<string>(PAYMENT_OPTIONS[0]);
  const [cartInstallment, setCartInstallment] = useState<string>(INSTALLMENTS[INSTALLMENTS.length - 1]);
  const [search, setSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [checkoutKb, setCheckoutKb] = useState<'name' | 'phone' | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
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
  const {methods: pickupMethods} = usePickupMethods(true);
  const [guidedSettings,setGuidedSettings]=useState(()=>getTotemSettings().assistant);
  const [attractContent,setAttractContent]=useState(()=>getTotemSettings().attractContent);
  const [shoppingIntent,setShoppingIntent]=useState('all');
  const [dayOffers,setDayOffers]=useState<DayOffer[]>([]);
  const [offerNow,setOfferNow]=useState(Date.now);
  useEffect(()=>{let active=true;const refresh=()=>{void loadTotemOffers().then(rows=>{if(active)setDayOffers(rows);}).catch(()=>{});setOfferNow(Date.now());};refresh();const timer=window.setInterval(refresh,60000);return()=>{active=false;window.clearInterval(timer);};},[]);
  const [filterAttrs, setFilterAttrs] = useState(() => totemFilterAttributes());

  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);
  const [exitChecking, setExitChecking] = useState(false);
  const [mode, setMode] = useState<TotemMode>(() => getTotemSettings().mode);
  const [vertical, setVertical] = useState<TotemVertical>(() => getTotemSettings().vertical);
  const [columns, setColumns] = useState<TotemColumns>(() => getTotemSettings().columns);
  const [askCustomerName, setAskCustomerName] = useState(() => getTotemSettings().askCustomerName);
  const [offerFulfillment, setOfferFulfillment] = useState(() => getTotemSettings().offerFulfillment);
  const [printTicket, setPrintTicket] = useState(() => getTotemSettings().printTicket);
  const [audioAssist, setAudioAssist] = useState(() => getTotemSettings().audioAssist);
  const [showAttractScreen, setShowAttractScreen] = useState(() => getTotemSettings().showAttractScreen);
  const [showActionButtons, setShowActionButtons] = useState(
    () => getTotemSettings().showActionButtons !== false,
  );
  const [customGreetingText, setCustomGreetingText] = useState(
    () => getTotemSettings().customGreetingText || '',
  );
  const [customSubtitleText, setCustomSubtitleText] = useState(
    () => getTotemSettings().customSubtitleText || '',
  );
  const [storeName, setStoreName] = useState(() => getTotemSettings().storeName);
  const [headerSubtitle, setHeaderSubtitle] = useState(() => getTotemSettings().headerSubtitle);
  const [storeLogo, setStoreLogo] = useState(() => getTotemSettings().storeLogo);
  const [attractBackground, setAttractBackground] = useState(() => getTotemSettings().attractBackground);
  const [attractGradientColor, setAttractGradientColor] = useState(
    () => getTotemSettings().attractGradientColor,
  );
  const [attractLayout, setAttractLayout] = useState(() => getTotemSettings().attractLayout);
  const [keyboardPlacement, setKeyboardPlacement] = useState<TotemKeyboardPlacement>(
    () => getTotemSettings().keyboardPlacement,
  );
  const [sessionMode, setSessionMode] = useState<TotemMode | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => getTotemSettings().audioAssist);
  const [trackingToken,setTrackingToken]=useState<string>();
  const [whatsappUrl,setWhatsappUrl]=useState<string>();
  const [whatsappQr,setWhatsappQr]=useState<string>();
  useEffect(()=>{let alive=true;setWhatsappQr(undefined);if(whatsappUrl)void QRCode.toDataURL(whatsappUrl,{width:300,margin:2}).then(image=>{if(alive)setWhatsappQr(image);}).catch(()=>{});return()=>{alive=false;};},[whatsappUrl]);
  const [catalog, setCatalog] = useState<(TotemProduct & { totalQty?: number })[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [sentToCashierDone, setSentToCashierDone] = useState(false);
  const [customerNotified, setCustomerNotified] = useState(false);
  const effectiveMode = sessionMode ?? mode;
  const catalogOnly = effectiveMode === 'catalog';
  const showDineIn = vertical === 'food' && offerFulfillment && !catalogOnly;
  const collectNameUpFront = askCustomerName && !catalogOnly;
  const canPrintTicket = printTicket && !catalogOnly;
  const askPhoneOnCheckout = !catalogOnly;
  const phoneRequired = askPhoneOnCheckout && !canPrintTicket;
  const copy = totemCopy(vertical);
  const senha = ticketId ? ticketSenha(ticketId) : '';
  const greeting = customGreetingText?.trim() || storeGreeting();
  // Carrinho só existe onde o totem aceita pedido (quiosque); vitrine pura continua sem compra.
  const cartMode = visual.cartEnabled && mode === 'kiosk';
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const isDark = visual.theme === 'dark';

  const homeStep: Step = showAttractScreen
    ? 'attract'
    : collectNameUpFront
      ? 'welcome'
      : 'catalog';

  // No catálogo, não devemos resetar a tela de volta para a abertura se o usuário está navegando.
  // O reset por inatividade só deve ocorrer se houver fluxo inacabado no checkout ou tela final concluída.
  const needsIdleReset =
    step === 'done' ||
    step === 'checkout' ||
    step === 'catalog' || step === 'guided' ||
    (step === 'welcome' && name.trim() !== '') ||
    Boolean(selection);

  const idleDuration = step === 'done' ? DONE_IDLE_MS : step==='catalog'||step==='guided' ? 5*60_000 : TRANSACTION_IDLE_MS;

  function bumpIdle() {
    setIdleTick((current) => current + 1);
  }

  function clearCatalogFilters() {
    setSearch('');
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
    setCheckoutKb(null);
    setContactOpen(false);
    setError(null);
    setSubmitting(false);
    setExitOpen(false);
    setExitPassword('');
    setExitError(null);
    setConfigs({});
    setTicketId(null);
    setShoppingIntent('all');setWhatsappUrl(undefined);setTrackingToken(undefined);
    setSentToCashierDone(false);
    setCustomerNotified(false);
    setGroup('all');
    setCart([]);
    setDoneCart([]);
    setAddedFlash(null);
    setCartPayment(PAYMENT_OPTIONS[0]);
    setCartInstallment(INSTALLMENTS[INSTALLMENTS.length - 1]);
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


  // Marcas ou categorias vêm do cadastro real da loja (com o ícone da marca), nunca de lista fixa.
  const [totemBrands, setTotemBrands] = useState<TotemBrandInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void apiGetTotemBrands().then((rows) => { if (alive) setTotemBrands(rows); }).catch(() => undefined);
    load();
    window.addEventListener('marthi-totem-live', load);
    return () => { alive = false; window.removeEventListener('marthi-totem-live', load); };
  }, []);
  const brandIndex = useMemo(() => {
    const index = new Map<string, TotemBrandInfo>();
    for (const item of totemBrands) {
      index.set(normalizeKey(item.slug), item);
      index.set(normalizeKey(item.name), item);
    }
    return index;
  }, [totemBrands]);
  const availableCatalog = useMemo(
    () => catalog.filter((item) => productAvailableForTotem(pickupMethods, listTotemStock().find((stock) => stock.id === item.stockId))),
    [catalog, pickupMethods],
  );
  const navItems = useMemo<TotemNavItem[]>(() => {
    const groups = new Map<string, TotemNavItem>();
    for (const product of availableCatalog) {
      const { key, label, logo } = navGroupOf(product, visual.navGroup, brandIndex);
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key, { key, label, count: 1, image: logo ?? product.images[0], logo });
    }
    return [...groups.values()].sort((a, b) =>
      a.key === 'outros' ? 1 : b.key === 'outros' ? -1 : a.label.localeCompare(b.label, 'pt-BR'),
    );
  }, [availableCatalog, visual.navGroup, brandIndex]);

  useEffect(() => {
    if (group !== 'all' && !navItems.some((item) => item.key === group)) setGroup('all');
  }, [group, navItems]);

  const brandProducts = useMemo(() => {
    return availableCatalog.filter((item) => group === 'all' || navGroupOf(item, visual.navGroup, brandIndex).key === group);
  }, [group, availableCatalog, visual.navGroup, brandIndex]);

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    return brandProducts.filter((item) => {
      const searchOk = query === '' || item.name.toLowerCase().includes(query);
      const attrOk = filterAttrs.every((attr) => {
        const selected = filters[attr.id] ?? 'all';
        if (selected === 'all') return true;
        return productAttrValues(item, attr).includes(selected);
      });
      const offerOk=shoppingIntent!=='offers'||dayOffers.some(offer=>offer.criteria.stockIds.includes(item.stockId||'')&&Date.parse(offer.endDate)>offerNow&&(!offer.startDate||Date.parse(offer.startDate)<=offerNow));
      return searchOk && attrOk && offerOk;
    }).sort((a,b)=>shoppingIntent==='low'?a.cashPrice-b.cashPrice:shoppingIntent==='new'?Date.parse(listTotemStock().find(row=>row.id===b.stockId)?.createdAt||'')-Date.parse(listTotemStock().find(row=>row.id===a.stockId)?.createdAt||''):0);
  }, [brandProducts, search, filters, filterAttrs,shoppingIntent,dayOffers,offerNow]);

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
  }, [step, group, search, filters]);

  useEffect(() => {
    setFilters({});
  }, [group]);

  // Tema escuro também pinta o fundo da página enquanto a vitrine rola.
  useEffect(() => {
    const dark = visual.theme === 'dark';
    document.documentElement.classList.toggle('totem-html-dark', dark);
    document.body.classList.toggle('totem-html-dark', dark);
    return () => {
      document.documentElement.classList.remove('totem-html-dark');
      document.body.classList.remove('totem-html-dark');
    };
  }, [visual.theme]);

  useEffect(() => {
    if (!needsIdleReset) return;
    const timer = window.setTimeout(() => {
      resetToHome();
      window.dispatchEvent(new Event('marthi-totem-live'));
    }, idleDuration);
    return () => window.clearTimeout(timer);
  }, [
    needsIdleReset,
    idleDuration,
    idleTick,
    step,
    selection,
    name,
    phone,
    exitOpen,
    checkoutKb,
    contactOpen,
  ]);

  useEffect(() => {
    if (step !== 'checkout') {
      setCheckoutKb(null);
      return;
    }
    if (catalogOnly) return;
    if (!name.trim()) {
      setCheckoutKb('name');
    } else if (phoneRequired && onlyDigits(phone).length < 10) {
      setCheckoutKb('phone');
    }
  }, [step, catalogOnly, phoneRequired]);

  useEffect(() => {
    if (!checkoutKb || step !== 'checkout') return;
    const node = document.getElementById('totem-checkout-kb');
    window.setTimeout(() => {
      node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, [checkoutKb, step]);

  useEffect(() => {
    let lastActivity = 0;
    function onActivity() {
      const now = Date.now();
      if (now - lastActivity > 1000) {
        lastActivity = now;
        bumpIdle();
      }
    }
    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', onActivity, options);
    window.addEventListener('pointermove', onActivity, options);
    window.addEventListener('mousemove', onActivity, options);
    window.addEventListener('keydown', onActivity, options);
    window.addEventListener('touchstart', onActivity, options);
    window.addEventListener('touchmove', onActivity, options);
    window.addEventListener('wheel', onActivity, options);
    window.addEventListener('scroll', onActivity, options);
    window.addEventListener('click', onActivity, options);
    return () => {
      window.removeEventListener('pointerdown', onActivity, options);
      window.removeEventListener('pointermove', onActivity, options);
      window.removeEventListener('mousemove', onActivity, options);
      window.removeEventListener('keydown', onActivity, options);
      window.removeEventListener('touchstart', onActivity, options);
      window.removeEventListener('touchmove', onActivity, options);
      window.removeEventListener('wheel', onActivity, options);
      window.removeEventListener('scroll', onActivity, options);
      window.removeEventListener('click', onActivity, options);
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
      setCatalogError(null);
      try {
        await Promise.all([
          hydrateTotemSettingsFromApi().catch((error) => {
            console.error('[totem] settings Nest', error);
          }),
          hydrateAttributesFromApi().catch((error) => {
            console.error('[totem] attributes Nest', error);
          }),
        ]);
        if (active) {
          const settings = getTotemSettings();
          setMode(settings.mode);
          setVertical(settings.vertical);
          setColumns(settings.columns);
          setAskCustomerName(settings.askCustomerName);
          setOfferFulfillment(settings.offerFulfillment);
          setPrintTicket(settings.printTicket);
          setAudioAssist(settings.audioAssist);
          setShowAttractScreen(settings.showAttractScreen);
          setShowActionButtons(settings.showActionButtons !== false);
          setCustomGreetingText(settings.customGreetingText || '');
          setCustomSubtitleText(settings.customSubtitleText || '');
          setStoreName(settings.storeName);
          setHeaderSubtitle(settings.headerSubtitle);
          setGuidedSettings(settings.assistant);setAttractContent(settings.attractContent);
          setStoreLogo(settings.storeLogo);
          setAttractBackground(settings.attractBackground);
          setAttractGradientColor(settings.attractGradientColor);
          setAttractLayout(settings.attractLayout);
          setKeyboardPlacement(settings.keyboardPlacement);
          setVisual(visualFrom(settings));
          setCardAttrs(totemCardAttributes());
          setFilterAttrs(totemFilterAttributes());
        }
        const next = await loadTotemCatalog();
        if (active) {
          setCatalog(next);
          if (next.length === 0) {
            setCatalogError(
              'Nenhum item com “Exibir no totem” no estoque. Marque no ERP e atualize.',
            );
          }
        }
      } catch {
        if (active) {
          setCatalog([]);
          setCatalogError('Não foi possível carregar o estoque do servidor.');
        }
      } finally {
        if (active) setCatalogLoading(false);
      }
    }
    void hydrateCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function applyCatalog(next: ReturnType<typeof listTotemCatalog>) {
      setCatalog((current) => {
        return catalogFingerprint(current) === catalogFingerprint(next) ? current : next;
      });
    }

    function applySettingsFromCache() {
      const settings = getTotemSettings();
      setMode(settings.mode);
      setVertical(settings.vertical);
      setColumns(settings.columns);
      setAskCustomerName(settings.askCustomerName);
      setOfferFulfillment(settings.offerFulfillment);
      setPrintTicket(settings.printTicket);
      setAudioAssist(settings.audioAssist);
      setShowAttractScreen(settings.showAttractScreen);
      setShowActionButtons(settings.showActionButtons !== false);
      setCustomGreetingText(settings.customGreetingText || '');
      setCustomSubtitleText(settings.customSubtitleText || '');
      setStoreName(settings.storeName);
      setHeaderSubtitle(settings.headerSubtitle);
      setGuidedSettings(settings.assistant);setAttractContent(settings.attractContent);
      setStoreLogo(settings.storeLogo);
      setAttractBackground(settings.attractBackground);
      setAttractGradientColor(settings.attractGradientColor);
      setAttractLayout(settings.attractLayout);
      setKeyboardPlacement(settings.keyboardPlacement);
      setVisual(visualFrom(settings));
      setCardAttrs(totemCardAttributes());
      setFilterAttrs(totemFilterAttributes());
    }

    async function refreshLive() {
      try {
        await Promise.all([
          hydrateTotemSettingsFromApi(),
          hydrateAttributesFromApi(),
        ]);
      } catch {
        /* cache local já aplicado */
      }
      applySettingsFromCache();
      await loadTotemCatalog().then(next => {applyCatalog(next);setCatalogError(null);}).catch(()=>{
        applyCatalog(listTotemCatalog());
        setCatalogError('Conexão instável. Tentando atualizar o catálogo novamente.');
      });
    }

    return subscribeTotemLive(refreshLive);
  }, []);

  useEffect(()=>{
    setSelection(current=>{
      if(!current)return current;
      const product=catalog.find(item=>item.stockId===current.stockId);
      if(!product)return current;
      const quote=quoteFromPicked(product.name,product.cashPrice,current.picked,listTotemStock().filter(item=>item.id===current.stockId));
      if(!quote.stock)return current;
      const baseCashPrice=quote.cashPrice;
      const pickupPrice=quote.stock.pickupPrices?.[current.pickupMethodId||'']??baseCashPrice;
      if(!(pickupPrice>0))return current;
      const cashPrice=dayOfferFor(dayOffers,current.stockId||'',Object.fromEntries(current.picked.map(a=>[a.id,a.value])),pickupPrice)?.promoPrice??pickupPrice;
      const cardRateOverride=quote.stock.cardRate||undefined;
      return {...current,product,baseCashPrice,cashPrice,pickupPrices:quote.stock.pickupPrices,cardRateOverride,cardFeePercent:cardRateOverride??totemCardFee(Number.parseInt(current.installment,10)||18)};
    });
  },[catalog,dayOffers]);

  useEffect(() => {
    if (!collectNameUpFront && step === 'welcome') setStep('catalog');
    if (!showAttractScreen && step === 'attract') {
      setStep(collectNameUpFront ? 'welcome' : 'catalog');
    }
  }, [collectNameUpFront, showAttractScreen, step]);

  function beginOrder() {
    bumpIdle();
    setSessionMode('kiosk');
    setStep(guidedSettings.enabled?'guided':askCustomerName ? 'welcome' : 'catalog');
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
    const stock=listTotemStock().find(item=>item.id===product.stockId);
    const selected=selectProductVariation(stock,base);
    if(selected) Object.assign(base,selected.attrs);
    const available=productPickupMethods(pickupMethods,stock??null,selected);
    if(!available.some(method=>method.id===base['pickup-method'])) base['pickup-method']=available[0]?.id||'';
    return base;
  }

  function patchConfig(productId: number, attrId: string, value: string) {
    setConfigs((current) => {
      const product = catalog.find((item) => item.id === productId);
      const base = product ? getConfig(product) : current[productId] ?? {};
      const next={...base,[attrId]:value};
      if(product && attrId!=='pickup-method') {
        const selected=selectProductVariation(listTotemStock().find(item=>item.id===product.stockId),next,attrId);
        if(selected) Object.assign(next,selected.attrs);
      }
      return { ...current, [productId]: next };
    });
  }

  function openCheckout(product: TotemProduct) {
    if (!preview) trackTotemProductClick({ productId: product.id, productName: product.name });
    if (catalogOnly && mode !== 'kiosk') return;
    if (catalogOnly) setSessionMode('kiosk');
    setSelection(buildSelection(product));
    setError(null);
    setKeyboardOpen(false);
    setOpenFilter(null);
    setStep('checkout');
  }

  /** Carrinho: cada toque em "Adicionar" soma o item com as escolhas feitas no card. */
  function addToCart(product: TotemProduct) {
    bumpIdle();
    if (!preview) trackTotemProductClick({ productId: product.id, productName: product.name });
    if (catalogOnly && mode !== 'kiosk') return;
    if (catalogOnly) setSessionMode('kiosk');
    const line = buildSelection(product);
    if (!line.stockId || !line.pickupMethodId || !(line.cashPrice > 0)) return;
    const pickupName = pickupMethods.find((method) => method.id === line.pickupMethodId)?.name || '';
    const key = [line.stockId, line.pickupMethodId, ...line.picked.map((attr) => `${attr.id}=${attr.value}`)].join('|');
    setCart((current) =>
      current.some((item) => item.key === key)
        ? current.map((item) => (item.key === key ? { ...item, qty: Math.min(99, item.qty + 1) } : item))
        : [
            ...current,
            {
              key,
              product,
              stockId: line.stockId!,
              pickupMethodId: line.pickupMethodId!,
              pickupName,
              picked: line.picked,
              unitPrice: line.cashPrice,
              qty: 1,
            },
          ],
    );
    setAddedFlash(product.id);
    window.setTimeout(() => setAddedFlash((current) => (current === product.id ? null : current)), 1400);
  }

  function openCart() {
    bumpIdle();
    if (!cart.length) return;
    setSelection(null);
    setError(null);
    setKeyboardOpen(false);
    setOpenFilter(null);
    setStep('checkout');
  }

  function buildSelection(product: TotemProduct): Selection {
    const config = getConfig(product);
    const picked = pickedFromConfig(product, config, cardAttrs);
    if (showDineIn) {
      picked.push({
        id: TOTEM_DINE_ID,
        name: 'Pedido',
        value: config[TOTEM_DINE_ID] || TOTEM_DINE_OPTIONS[0],
      });
    }
    const quote = quoteFromPicked(product.name, product.cashPrice, picked, listTotemStock().filter(s => s.id === product.stockId));
    const stockFee =
      quote.stock?.cardRate !== undefined && quote.stock?.cardRate !== null && Number.isFinite(Number(quote.stock.cardRate)) && Number(quote.stock.cardRate)>0
        ? Number(quote.stock.cardRate)
        : undefined;
    const cardFeePercent = stockFee !== undefined ? stockFee : totemCardFee(18);
    return {
      stockId:quote.stock?.id,pickupPrices:quote.stock?.pickupPrices,baseCashPrice:quote.cashPrice,
      pickupAllowedIds:productPickupMethods(pickupMethods,quote.stock,quote.stock?.variations?.[0]).map(method=>method.id),
      pickupMethodId:config['pickup-method'],
      product,
      picked,
      payment: PAYMENT_OPTIONS[0],
      installment: INSTALLMENTS[INSTALLMENTS.length-1],
      cashPrice: dayOfferFor(dayOffers,product.stockId||'',config,quote.stock?.pickupPrices?.[config['pickup-method']]??quote.cashPrice)?.promoPrice ?? quote.stock?.pickupPrices?.[config['pickup-method']] ?? quote.cashPrice,
      installmentLabel: formatInstallment(dayOfferFor(dayOffers,product.stockId||'',config,quote.stock?.pickupPrices?.[config['pickup-method']]??quote.cashPrice)?.promoPrice ?? quote.stock?.pickupPrices?.[config['pickup-method']] ?? quote.cashPrice, 18, cardFeePercent),
      cardFeePercent,cardRateOverride:stockFee,
    };
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

  const { user } = useAuth();

  function requestExit() {
    setExitPassword('');
    setExitError(null);
    setExitOpen(true);
  }

  async function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitChecking) return;
    if (preview) {
      setExitOpen(false);
      return;
    }
    setExitChecking(true);
    setExitError(null);
    try {
      // A senha é conferida no servidor: o totem público nem recebe a senha configurada.
      await apiUnlockTotem(exitPassword);
    } catch (err) {
      setExitError(err instanceof Error ? err.message : 'Não foi possível conferir a senha.');
      setExitPassword('');
      return;
    } finally {
      setExitChecking(false);
    }
    unlockDeviceFromTotem();
    setExitOpen(false);
    navigate(user ? '/painel' : '/');
  }

  function appendSearch(char: string) {
    bumpIdle();
    setSearch((current) => `${current}${char}`.slice(0, 40));
  }

  function backspaceSearch() {
    bumpIdle();
    setSearch((current) => current.slice(0, -1));
  }

  const [notificationWarning,setNotificationWarning]=useState<string>();

  /** Envia o carrinho inteiro: o servidor cota cada item e grava tudo com a mesma senha. */
  async function submitCart(destination: 'cashier' | 'whatsapp') {
    const isToCashier = destination === 'cashier';
    const parcelado = copy.showInstallments && cartPayment === 'Parcelado';
    try {
      const result = await submitTotemCart({
        destination,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        payment: parcelado ? 'Parcelado' : 'À vista',
        installment: parcelado ? cartInstallment : null,
        items: cart.map((line) => ({
          stockId: line.stockId,
          pickupMethodId: line.pickupMethodId,
          attributes: line.picked,
          qty: line.qty,
          productName: line.product.name,
        })),
      });
      setNotificationWarning(result.notificationWarning);
      setTrackingToken(result.trackingToken);
      setWhatsappUrl(result.whatsappUrl);
      setCustomerNotified(result.customerNotified);
      setTicketId(result.ticketId);
      setSentToCashierDone(isToCashier);
      setDoneCart(cart);
      setCart([]);
      setStep('done');
      if (canPrintTicket) {
        const count = cart.reduce((sum, line) => sum + line.qty, 0);
        printCurrentTicket(result.ticketId, `${count} ${count === 1 ? 'item' : 'itens'}`, [], formatBRL(result.total || cartTotal));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitOrder(destination: 'cashier' | 'whatsapp') {
    if (preview) { setError('Esta é uma prévia. Abra o Totem para enviar um pedido real.'); return; }
    if (!selection && !cart.length) return;
    if (!name.trim()) {
      setError('Informe seu nome para confirmar o pedido.');
      setCheckoutKb('name');
      return;
    }
    if ((phoneRequired || destination === 'whatsapp') && onlyDigits(phone).length < 10) {
      setError(
        destination === 'whatsapp'
          ? 'Informe seu WhatsApp com DDD: é para esse número que vamos mandar a mensagem.'
          : 'Informe um telefone com DDD para confirmar o pedido.',
      );
      setCheckoutKb('phone');
      return;
    }
    setError(null);
    setSubmitting(true);
    setCheckoutKb(null);

    if (!selection) {
      await submitCart(destination);
      return;
    }
    if(!selection.stockId||!selection.pickupMethodId){setError('Escolha o tipo de retirada para continuar.');setSubmitting(false);return;}
    const priceLabel =
      !copy.showInstallments || selection.payment === 'À vista'
        ? formatBRL(selection.cashPrice)
        : `${selection.installment} · ${formatInstallment(
            selection.cashPrice,
            Number.parseInt(selection.installment, 10) || 18,
            selection.cardFeePercent,
          )}`;
    const legacy = toLegacyFields(selection.picked);
    const isToCashier = destination === 'cashier';

    try {
      const result = await submitTotemLead({
        destination,
        stockId:selection.stockId,pickupMethodId:selection.pickupMethodId,deliveryAddress:selection.deliveryAddress,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        productName: selection.product.name,
        attributes: selection.picked,
        ...legacy,
        payment: copy.showInstallments ? selection.payment : 'À vista',
        installment:
          copy.showInstallments && selection.payment === 'Parcelado' ? selection.installment : null,
        priceLabel,
        cashPrice: selection.cashPrice,
        sentToCashier: isToCashier,
      });
      setNotificationWarning(result.notificationWarning);
      setTrackingToken(result.trackingToken);
      setWhatsappUrl(result.whatsappUrl);
      setCustomerNotified(result.customerNotified);
      setTicketId(result.ticketId);
      setSentToCashierDone(isToCashier);
      setStep('done');
      if (canPrintTicket) {
        printCurrentTicket(result.ticketId, selection.product.name, selection.picked, priceLabel);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`totem ${step === 'catalog' ? 'totem--page-scroll' : ''} ${step === 'attract' ? 'totem--attract' : ''}${isDark ? ' totem--dark' : ''}${cartMode && step === 'catalog' && cart.length ? ' totem--has-cart' : ''}`}
      onPointerDown={bumpIdle}
      onKeyDown={bumpIdle}
      onWheel={bumpIdle}
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
            <span>{headerSubtitle || (catalogOnly ? copy.catalogSubtitle : copy.kioskSubtitle)}</span>
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
        {step === 'attract' ? (
          <button type="button" className="totem__catalog-top" onClick={beginCatalogBrowse}>
            Catálogo
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
          layout={attractLayout}
          content={attractContent}
          showActionButtons={showActionButtons}
          customGreetingText={customGreetingText}
          customSubtitleText={customSubtitleText}
          onStartOrder={beginOrder}
          onBrowseCatalog={beginCatalogBrowse}
        />
      )}

      {step==='guided'&&<TotemGuidedFlow settings={guidedSettings} brands={visual.navGroup==='brand'?navItems.filter(item=>item.key!=='outros').map(item=>({id:item.key,label:item.label,logo:item.logo})):[]} hasOffers={dayOffers.some(offer=>Date.parse(offer.endDate)>offerNow&&(!offer.startDate||Date.parse(offer.startDate)<=offerNow)&&catalog.some(product=>offer.criteria.stockIds.includes(product.stockId||'')&&productAvailableForTotem(pickupMethods,listTotemStock().find(stock=>stock.id===product.stockId))))} onCancel={resetTotem} onComplete={(customer,intent,chosenBrand)=>{setName(customer);setShoppingIntent(intent);setGroup(chosenBrand==='all'?'all':chosenBrand);setStep('catalog');bumpIdle();}}/>}
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
                    readOnly
                    inputMode="none"
                    autoComplete="off"
                    placeholder="Use o teclado virtual"
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
                    readOnly
                    inputMode="none"
                    autoComplete="off"
                    placeholder="Use o teclado virtual"
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
        <section className={`totem__floor totem__floor--topnav${visual.catalogNav === 'sidebar' ? ' totem__floor--sidebar' : ''}`}>
          <TotemTopBanner images={visual.topBanners} />
          {visual.catalogNav === 'sidebar' ? (
            <TotemSideNav
              title={visual.navGroup === 'category' ? 'Categorias' : 'Marcas'}
              items={navItems}
              active={group}
              total={availableCatalog.length}
              onSelect={(key) => {
                bumpIdle();
                setGroup(key);
                setKeyboardOpen(false);
              }}
            />
          ) : null}
          <div className="totem__stage" ref={searchPanelRef}>
            {namedWelcome ? <p className="totem__hello">{namedWelcome}</p> : null}
            <div className="totem__search-panel">
              {copy.showBrandFilters || navItems.length > 0 ? (
                <div className="totem__toolbar totem__toolbar--quiet">
                  <div className="totem__brands" role="tablist" aria-label={visual.navGroup === 'category' ? 'Categorias' : 'Marcas'}>
                    {visual.catalogNav === 'top'
                      ? [{ key: 'all', label: 'Todos', logo: undefined as string | undefined }, ...navItems].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={group === item.key}
                            aria-label={item.label}
                            title={item.label}
                            className={`totem-chip${item.logo ? ' totem-chip--logo' : ''} ${group === item.key ? 'is-active' : ''}`}
                            onClick={() => {
                              bumpIdle();
                              setGroup(item.key);
                              setKeyboardOpen(false);
                            }}
                          >
                            {/* Marca com ícone: só o ícone (Apple, Samsung…); sem ícone, o nome. */}
                            {item.logo ? <img src={item.logo} alt="" draggable={false} /> : item.label}
                          </button>
                        ))
                      : null}
                    <button type="button" className={`totem-chip totem-chip--offer ${shoppingIntent==='offers'?'is-active':''}`} onClick={()=>{bumpIdle();setShoppingIntent(current=>current==='offers'?'all':'offers');}}>🔥 Ofertas do dia</button>
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
            >
              {products.map((product) => {
                const config = getConfig(product);
                const pickers = cardAttrs
                  .filter((attr) => resolveTotemAttrOptions(product, attr).length > 0)
                  .slice(0, 5);
                const quote = quoteTotemVariant(product.name, product.cashPrice, config, listTotemStock().filter(s => s.id === product.stockId));
                const availablePickup = productPickupMethods(pickupMethods,quote.stock,quote.stock?.variations?.[0]);
                const pickupPrice = quote.stock?.pickupPrices?.[config['pickup-method']];
                const normalPrice = typeof pickupPrice === 'number' ? pickupPrice : quote.cashPrice;
                const offer=dayOfferFor(dayOffers,product.stockId||'',config,normalPrice,offerNow);
                const displayedPrice = offer?.promoPrice ?? normalPrice;
                return (
                  <article
                    key={product.id}
                    className="totem-card"
                    onPointerDown={bumpIdle}
                  >
                    <div
                      className="totem-card__media"
                      onClick={() => {
                        if (catalogOnly && !preview) {
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
                      {offer&&<div className="totem-card__offer"><strong>OFERTA DO DIA</strong><span>{offer.name}</span><small>Termina em {Math.max(1,Math.ceil((Date.parse(offer.endDate)-offerNow)/60000))} min</small></div>}
                      <h2 title={product.name}>{product.name}</h2>

                      <div className="totem-card__fields" data-count={pickers.length + 1 + (showDineIn ? 1 : 0)}>
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
                        <TotemPicker
                          label="Tipo de retirada"
                          value={availablePickup.find(method => method.id === config['pickup-method'])?.name || 'Selecionar'}
                          options={availablePickup.map(method => method.name)}
                          onChange={value => {
                            bumpIdle();
                            const method = availablePickup.find(method => method.name === value);
                            if (method) patchConfig(product.id, 'pickup-method', method.id);
                          }}
                        />
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
                          {offer&&<del>De {formatBRL(normalPrice)}</del>}
                          <strong>{formatBRL(displayedPrice)}</strong>
                          {copy.showInstallments ? <small>{formatInstallment(displayedPrice, 18, quote.stock?.cardRate ? quote.stock.cardRate : undefined)}</small> : null}
                          {quote.stock ? (
                            <em className="totem-card__stock">
                              {quote.qty > 0 ? `${quote.qty} un. em estoque` : 'Sob consulta'}
                            </em>
                          ) : null}
                        </div>
                        {catalogOnly && mode !== 'kiosk' ? null : (
                          cartMode ? (
                            <button
                              type="button"
                              className={`totem-btn totem-btn--primary totem-card__order totem-card__add${addedFlash === product.id ? ' is-added' : ''}`}
                              aria-label={`Adicionar ${product.name} ao carrinho`}
                              disabled={!quote.stock || displayedPrice<=0 || !config['pickup-method']}
                              onClick={() => addToCart(product)}
                            >
                              {addedFlash === product.id ? '✓ Adicionado' : '+ Adicionar'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="totem-btn totem-btn--primary totem-card__order"
                              aria-label={`Fazer pedido de ${product.name}`}
                              disabled={!quote.stock || displayedPrice<=0 || !config['pickup-method']}
                              onClick={() => openCheckout(product)}
                            >
                              Fazer pedido
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {catalogError && products.length > 0 && <p className="totem__empty" role="status">{catalogError}</p>}
              {catalogLoading && products.length === 0 && (
                <p className="totem__empty">Carregando catálogo…</p>
              )}
              {!catalogLoading && products.length === 0 && (
                <p className="totem__empty">
                  {catalogError ||
                    (search || group !== 'all'
                      ? 'Nenhum produto encontrado com esses filtros.'
                      : 'Nenhum produto no totem. Marque “Exibir no totem” no estoque do ERP.')}
                </p>
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

      {step === 'checkout' && (selection || (cartMode && cart.length > 0)) && (
        <section className={`totem__checkout${selection ? '' : ' totem__checkout--cart'}`}>
          <div className="totem__checkout-card">
            {selection ? (
              <ProductCarousel
                images={selection.product.images}
                alt={selection.product.name}
                size="hero"
                className={`brand-${selection.product.brand}`}
              />
            ) : (
              <div className="totem__cart-panel">
                <h1 className="totem__cart-title">Seu pedido</h1>
                <TotemCartReview
                  lines={cart}
                  disabled={submitting}
                  onQty={(key, qty) => {
                    bumpIdle();
                    setCart((current) => current.map((line) => (line.key === key ? { ...line, qty } : line)));
                  }}
                  onRemove={(key) => {
                    bumpIdle();
                    const next = cart.filter((line) => line.key !== key);
                    setCart(next);
                    if (!next.length) setStep('catalog');
                  }}
                />
                <button
                  type="button"
                  className="totem-btn totem-btn--ghost totem-btn--block"
                  disabled={submitting}
                  onClick={() => {
                    bumpIdle();
                    setStep('catalog');
                  }}
                >
                  + Adicionar mais itens
                </button>
              </div>
            )}

            <div className="totem__checkout-form">
              {selection ? <h1>{selection.product.name}</h1> : null}
              {selection ? <PickupFields publicMode product={{id:selection.stockId,price:selection.baseCashPrice,pickupPrices:selection.pickupPrices,allowedPickupMethodIds:selection.pickupAllowedIds}} methodId={selection.pickupMethodId} address={selection.deliveryAddress} onChange={(pickupMethodId,deliveryAddress,price)=>setSelection(current=>current?{...current,pickupMethodId,deliveryAddress,cashPrice:dayOfferFor(dayOffers,current.stockId||'',Object.fromEntries(current.picked.map(a=>[a.id,a.value])),price??current.baseCashPrice)?.promoPrice??price??current.baseCashPrice}:current)}/> : null}
              {selection ? (
                <div className="totem__summary">
                  {selection.picked.map((item) => (
                    <p key={item.id}>
                      <span>{item.name}</span>
                      <strong>{item.value}</strong>
                    </p>
                  ))}
                </div>
              ) : null}

              {error && (
                <p className="totem__error" role="alert">
                  {error}
                </p>
              )}

              {!catalogOnly ? (
                <>
                  {collectNameUpFront && name.trim() ? (
                    <p className="totem__summary-name">
                      Pedido de <strong>{name.trim()}</strong>
                    </p>
                  ) : null}

                  <label
                    className={`totem-field${checkoutKb === 'name' ? ' totem-field--focus' : ''}`}
                  >
                    Digite seu nome e sobrenome
                    <input
                      value={name}
                      readOnly
                      inputMode="none"
                      autoComplete="off"
                      placeholder="Toque para digitar seu nome"
                      disabled={submitting}
                      onFocus={() => {
                        bumpIdle();
                        setCheckoutKb('name');
                      }}
                      onClick={() => {
                        bumpIdle();
                        setCheckoutKb('name');
                      }}
                    />
                  </label>

                  {askPhoneOnCheckout ? (
                    <label
                      className={`totem-field${checkoutKb === 'phone' ? ' totem-field--focus' : ''}`}
                    >
                      Digite seu telefone com DDD
                      <input
                        value={phone}
                        readOnly
                        inputMode="none"
                        autoComplete="off"
                        placeholder="(24) 99999-9999"
                        disabled={submitting}
                        onFocus={() => {
                          bumpIdle();
                          setCheckoutKb('phone');
                        }}
                        onClick={() => {
                          bumpIdle();
                          setCheckoutKb('phone');
                        }}
                      />
                    </label>
                  ) : null}

                  {checkoutKb ? (
                    <div className="totem__checkout-kb" id="totem-checkout-kb">
                      <TotemKeyboard
                        mode={checkoutKb === 'phone' ? 'numeric' : 'letters'}
                        onKey={(char) => {
                          bumpIdle();
                          if (checkoutKb === 'name') {
                            if (!/^[A-Za-z]$/.test(char)) return;
                            setName((current) => `${current}${char.toUpperCase()}`.slice(0, 40));
                            return;
                          }
                          if (!/^\d$/.test(char)) return;
                          setPhone((current) => maskTotemPhone(onlyDigits(current + char)));
                        }}
                        onBackspace={() => {
                          bumpIdle();
                          if (checkoutKb === 'name') {
                            setName((current) => current.slice(0, -1));
                            return;
                          }
                          setPhone((current) => maskTotemPhone(onlyDigits(current).slice(0, -1)));
                        }}
                        onSpace={() => {
                          bumpIdle();
                          if (checkoutKb === 'name') {
                            setName((current) => `${current} `.slice(0, 40));
                          }
                        }}
                        onClear={() => {
                          bumpIdle();
                          if (checkoutKb === 'name') setName('');
                          else setPhone('');
                        }}
                        onClose={() => {
                          bumpIdle();
                          if (checkoutKb === 'name' && askPhoneOnCheckout && !phone.trim()) {
                            setCheckoutKb('phone');
                            return;
                          }
                          setCheckoutKb(null);
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {copy.showInstallments ? (
                <TotemPicker
                  label="Modo de pagamento"
                  value={selection ? selection.payment : cartPayment}
                  options={PAYMENT_OPTIONS}
                  disabled={submitting}
                  onChange={(value) => (selection ? setSelection({ ...selection, payment: value }) : setCartPayment(value))}
                />
              ) : null}

              {copy.showInstallments && (selection ? selection.payment : cartPayment) === 'Parcelado' && (
                <TotemPicker
                  label="Parcelas"
                  value={selection ? selection.installment : cartInstallment}
                  options={INSTALLMENTS}
                  disabled={submitting}
                  onChange={(value) =>
                    selection
                      ? setSelection({ ...selection, installment: value,cardFeePercent:selection.cardRateOverride??totemCardFee(Number.parseInt(value,10)) })
                      : setCartInstallment(value)
                  }
                />
              )}

              <div className="totem__prices">
                {selection ? (
                  <div>
                    <span>Valor definido</span>
                    <strong>
                      {copy.showInstallments && selection.payment === 'Parcelado'
                        ? `${selection.installment} · ${formatInstallment(
                            selection.cashPrice,
                            Number.parseInt(selection.installment, 10) || 18,
                            selection.cardFeePercent,
                          )}`
                        : formatBRL(selection.cashPrice)}
                    </strong>
                  </div>
                ) : (
                  <div>
                    <span>{cartCount === 1 ? 'Total · 1 item' : `Total · ${cartCount} itens`}</span>
                    <strong>
                      {copy.showInstallments && cartPayment === 'Parcelado'
                        ? `${cartInstallment} · ${formatInstallment(
                            cartTotal,
                            Number.parseInt(cartInstallment, 10) || 18,
                            totemCardFee(Number.parseInt(cartInstallment, 10) || 18),
                          )}`
                        : formatBRL(cartTotal)}
                    </strong>
                  </div>
                )}
              </div>

              <div className="totem__checkout-actions" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                <button
                  type="button"
                  className="totem-btn totem-btn--primary totem-btn--block"
                  style={{
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    fontSize: '1.08rem',
                    fontWeight: 700,
                    padding: '16px 20px',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}
                  disabled={
                    submitting ||
                    !name.trim() ||
                    (phoneRequired && onlyDigits(phone).length < 10)
                  }
                  onClick={() => void handleSubmitOrder('cashier')}
                >
                  <span style={{ fontSize: '1.3rem' }} aria-hidden>🏪</span>
                  <span>{submitting ? 'Encaminhando ao Caixa…' : 'Encaminhar Venda para o Caixa'}</span>
                </button>

                <button
                  type="button"
                  className="totem-btn totem-btn--ghost totem-btn--block"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                  disabled={
                    submitting ||
                    !name.trim() ||
                    (phoneRequired && onlyDigits(phone).length < 10)
                  }
                  onClick={() => void handleSubmitOrder('whatsapp')}
                >
                  <span aria-hidden>📱</span>
                  <span>{submitting ? copy.sendingButton : 'Concluir pelo WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 'done' && (selection || doneCart.length > 0) && (
        <section className="totem__done">
          {guidedSettings.enabled&&<h2>{assistantText(guidedSettings.closingPrompt,name,guidedSettings.name)}</h2>}
          {!sentToCashierDone&&customerNotified&&(
            <div className="totem-whatsapp-sent" role="status">
              <span aria-hidden>💬</span>
              <strong>Mensagem enviada no seu WhatsApp!</strong>
              <p>
                {guidedSettings.name||'A loja'} já te mandou uma mensagem no {phone}. É só
                responder por lá para continuar.
              </p>
            </div>
          )}
          {!sentToCashierDone&&!customerNotified&&whatsappUrl&&<div className="totem-whatsapp-handoff">{whatsappQr&&<img src={whatsappQr} alt="QR Code para continuar este pedido com o vendedor no WhatsApp"/>}<p>Leia o QR Code com seu celular ou toque no botão para continuar com {guidedSettings.name||'o vendedor'}.</p><a className="totem-btn totem-btn--primary" href={whatsappUrl} target="_blank" rel="noreferrer">Continuar no WhatsApp</a></div>}
          {notificationWarning&&<p role="status">{notificationWarning}</p>}
          <h1>{notificationWarning?'Pedido registrado':sentToCashierDone ? 'Pedido Encaminhado para o Caixa!' : copy.doneTitle}</h1>
          {senha ? (
            <div className="totem__senha" aria-label={`Senha ${senha}`}>
              {senha}
            </div>
          ) : null}
          <p>
            {name.trim() ? `Obrigado, ${name.trim()}!` : 'Obrigado!'}{' '}
            {sentToCashierDone
              ? 'Seu pedido foi encaminhado com sucesso para a fila do caixa.'
              : notificationWarning?'O pedido está na fila do caixa para atendimento.':copy.doneHint}
          </p>
          {selection ? (
            <p>
              <strong>{selection.product.name}</strong>
              {formatPicked(selection.picked) ? ` (${formatPicked(selection.picked)})` : ''}.
            </p>
          ) : (
            <ul className="totem__done-items">
              {doneCart.map((line) => (
                <li key={line.key}>
                  <strong>
                    {line.qty}× {line.product.name}
                  </strong>
                  {formatPicked(line.picked) ? <span> · {formatPicked(line.picked)}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {trackingToken&&<p><a href={`/acompanhar-retirada/${trackingToken}`} target="_blank" rel="noreferrer">Acompanhar disponibilidade e entrega</a></p>}
          {sentToCashierDone ? (
            <div
              style={{
                background: 'rgba(22, 163, 74, 0.15)',
                border: '1px solid #16a34a',
                borderRadius: 12,
                padding: '16px 20px',
                margin: '18px 0',
                textAlign: 'center',
              }}
            >
              <strong style={{ display: 'block', fontSize: '1.15rem', color: '#4ade80', marginBottom: 6 }}>
                🏪 Dirija-se ao caixa com a sua senha
              </strong>
              <span style={{ fontSize: '0.92rem', color: '#e2e8f0', lineHeight: 1.45, display: 'block' }}>
                O atendente irá chamá-lo no balcão para cadastrar seus dados completos e finalizar o pagamento.
              </span>
            </div>
          ) : (
            <p className="totem__done-note">O pedido já está na fila do PDV para atendimento.</p>
          )}
          {canPrintTicket ? (
            <button
              type="button"
              className="totem-btn totem-btn--ghost"
              onClick={() =>
                selection
                  ? printCurrentTicket(
                      ticketId || 'PDV-0',
                      selection.product.name,
                      selection.picked,
                      formatBRL(selection.cashPrice),
                    )
                  : printCurrentTicket(
                      ticketId || 'PDV-0',
                      doneCart.map((line) => `${line.qty}x ${line.product.name}`).join(', '),
                      [],
                      formatBRL(doneCart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)),
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
        <TotemFooter
          hint={
            catalogOnly ? copy.footerCatalog : collectNameUpFront ? copy.footerNamed : copy.footerKiosk
          }
          open={contactOpen}
          onOpenChange={(open) => {
            bumpIdle();
            setContactOpen(open);
          }}
        >
          {cartMode && step === 'catalog' && cart.length > 0 ? (
            <TotemCartBar
              count={cartCount}
              total={cartTotal}
              gesture={visual.checkoutGesture}
              onOpen={openCart}
              onFinish={openCart}
            />
          ) : null}
        </TotemFooter>
      ) : null}

      {exitOpen && (
        <div className="totem-lock" role="dialog" aria-modal="true" aria-labelledby="totem-exit-title">
          <form
            id="totem-exit-form"
            className="totem-lock__card"
            onSubmit={confirmExit}
          >
            <h2 id="totem-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja no teclado abaixo para fechar o totem.</p>
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
                readOnly
                inputMode="none"
                autoComplete="off"
                placeholder="Use o teclado virtual"
                aria-describedby="totem-exit-kb"
              />
            </label>
            <div className="totem-lock__kb" id="totem-exit-kb">
              <TotemKeyboard
                onKey={(char) => {
                  setExitPassword((current) => `${current}${char}`.slice(0, 32));
                  setExitError(null);
                }}
                onBackspace={() => {
                  setExitPassword((current) => current.slice(0, -1));
                  setExitError(null);
                }}
                onSpace={() => {
                  setExitPassword((current) => `${current} `.slice(0, 32));
                  setExitError(null);
                }}
                onClear={() => {
                  setExitPassword('');
                  setExitError(null);
                }}
                onClose={() => {
                  const form = document.getElementById('totem-exit-form') as HTMLFormElement | null;
                  form?.requestSubmit();
                }}
              />
            </div>
            <div className="totem-lock__actions">
              <button
                type="button"
                className="totem-btn totem-btn--ghost"
                onClick={() => setExitOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="totem-btn totem-btn--primary" disabled={exitChecking}>
                {exitChecking ? 'Conferindo…' : 'Confirmar saída'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
